const fs = require('fs');
const Project = require('../../../database/models/Project');
const DataRow = require('../../../database/models/DataRow');

// Recursively normalize a raw cell value coming out of hyparquet into something
// Mongo/JSON can store: binary audio columns become base64 strings, BigInt
// (parquet INT64) becomes a plain number/string.
function normalizeValue(value) {
    if (value == null) return value;
    if (typeof value === 'bigint') {
        // Fall back to string for values outside the safe integer range.
        return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
    }
    if (Buffer.isBuffer(value)) {
        return value.toString('base64');
    }
    if (value instanceof Uint8Array) {
        return Buffer.from(value).toString('base64');
    }
    if (value instanceof Date) {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(normalizeValue);
    }
    return value;
}

function normalizeRow(row) {
    const out = {};
    for (const key of Object.keys(row)) {
        out[key] = normalizeValue(row[key]);
    }
    return out;
}

exports.processParquetUpload = async (fileInfo, projectName, selectedHeaders = [], customColumns = []) => {
    const filePath = fileInfo.path;
    const batchSize = 1000;

    console.log(`[Parquet Service] Processing file: ${filePath}`);
    console.log(`[Parquet Service] Project Name: ${projectName}`);

    if (!fs.existsSync(filePath)) {
        console.error(`[Parquet Service] File not found at path: ${filePath}`);
        throw new Error(`Uploaded file not found: ${filePath}`);
    }
    const stat = fs.statSync(filePath);
    console.log(`[Parquet Service] File size on disk: ${stat.size} bytes`);

    // hyparquet / hyparquet-compressors are ESM-only; load dynamically from CJS.
    console.log('[Parquet Service] Loading hyparquet / hyparquet-compressors...');
    const { parquetReadObjects, parquetMetadata } = await import('hyparquet');
    const { compressors } = await import('hyparquet-compressors');
    console.log('[Parquet Service] hyparquet modules loaded');

    const project = new Project({ name: projectName });
    await project.save();
    console.log(`[Parquet Service] Created Project ID: ${project._id}`);

    const buffer = fs.readFileSync(filePath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    console.log(`[Parquet Service] Read ${buffer.length} bytes into memory`);

    let metadata;
    try {
        metadata = parquetMetadata(arrayBuffer);
    } catch (err) {
        console.error('[Parquet Service] Failed to parse parquet metadata:', err);
        throw new Error(`Invalid or corrupt parquet file: ${err.message}`);
    }
    const headers = metadata.schema
        .filter((el) => el.num_children === undefined || el.num_children === 0)
        .map((el) => el.name)
        .filter((name) => name !== 'schema');
    console.log(`[Parquet Service] Schema headers detected: ${JSON.stringify(headers)}`);

    let rows;
    try {
        rows = await parquetReadObjects({ file: arrayBuffer, compressors });
    } catch (err) {
        console.error('[Parquet Service] Failed to read parquet rows:', err);
        throw new Error(`Failed to read parquet rows: ${err.message}`);
    }

    console.log(`[Parquet Service] Read ${rows.length} rows, ${headers.length} columns`);

    let batch = [];
    let rowCount = 0;

    try {
        for (const row of rows) {
            const normalized = normalizeRow(row);
            if (Object.keys(normalized).length === 0) continue;

            batch.push({ projectId: project._id, data: normalized });
            rowCount++;

            if (batch.length >= batchSize) {
                await DataRow.insertMany(batch, { ordered: false });
                process.stdout.write('.');
                batch = [];
            }
        }

        if (batch.length > 0) {
            await DataRow.insertMany(batch, { ordered: false });
        }
    } catch (err) {
        console.error('[Parquet Service] Failed inserting rows into DB:', err);
        throw err;
    }
    console.log(`[Parquet Service] Inserted ${rowCount} rows into DataRow collection`);

    project.headers = headers;
    project.selectedHeaders = selectedHeaders.length > 0 ? selectedHeaders : headers;
    project.customColumns = customColumns;
    project.totalRows = rowCount;
    await project.save();

    console.log(`\n[Parquet Service] Processing complete. Total rows: ${rowCount}`);

    fs.unlink(filePath, (err) => {
        if (err) console.error('Failed to delete temp file:', err);
    });

    return project;
};
