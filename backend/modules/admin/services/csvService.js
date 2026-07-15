const fs = require('fs');
const csv = require('csv-parser');
const Project = require('../../../database/models/Project');
const DataRow = require('../../../database/models/DataRow');

exports.processCsvUpload = async (fileInfo, projectName, selectedHeaders = [], customColumns = []) => {
    const filePath = fileInfo.path;
    const batchSize = 1000;

    console.log(`[CSV Service] Processing file: ${filePath}`);
    console.log(`[CSV Service] Project Name: ${projectName}`);

    // Create and save project to get ID
    const project = new Project({ name: projectName });
    await project.save();
    console.log(`[CSV Service] Created Project ID: ${project._id}`);

    let headers = [];
    let rowCount = 0;
    let batch = [];

    return new Promise((resolve, reject) => {
        // Use default buffer stream instead of forcing utf8 string
        const stream = fs.createReadStream(filePath)
            .pipe(csv());

        stream.on('headers', (h) => {
            console.log(`[CSV Service] Headers detected: ${h.length} columns`);
            headers = h;
        });

        stream.on('data', async (row) => {
            // Validate row is not empty/corrupt
            if (Object.keys(row).length === 0) return;

            batch.push({ projectId: project._id, data: row });
            rowCount++;

            if (batch.length >= batchSize) {
                stream.pause();
                try {
                    await DataRow.insertMany(batch, { ordered: false });
                    process.stdout.write(`.`); // Simple progress indicator
                    batch = [];
                    stream.resume();
                } catch (err) {
                    console.error('\n[CSV Service] Error inserting batch:', err);
                    stream.destroy(err);
                    reject(err);
                }
            }
        });

        stream.on('end', async () => {
            console.log('\n[CSV Service] Stream ended. Inserting remaining rows...');
            try {
                if (batch.length > 0) {
                    await DataRow.insertMany(batch, { ordered: false });
                }

                // Update project stats
                project.headers = headers;
                project.selectedHeaders = selectedHeaders.length > 0 ? selectedHeaders : headers;
                project.customColumns = customColumns;
                project.totalRows = rowCount;
                await project.save();

                console.log(`[CSV Service] Processing complete. Total rows: ${rowCount}`);

                // Clean up file
                fs.unlink(filePath, (err) => {
                    if (err) console.error("Failed to delete temp file:", err);
                });

                resolve(project);
            } catch (err) {
                console.error('[CSV Service] Error in end block:', err);
                reject(err);
            }
        });

        stream.on('error', (err) => {
            console.error('[CSV Service] Stream error:', err);
            reject(err);
        });
    });
};
