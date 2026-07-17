const path = require('path');
const csvService = require('../services/csvService');
const parquetService = require('../services/parquetService');

const Project = require('../../../database/models/Project');
const DataRow = require('../../../database/models/DataRow');

exports.uploadCsv = async (req, res) => {
    console.log('[Admin Controller] POST /admin/upload hit');
    console.log('[Admin Controller] req.file:', req.file ? {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path,
    } : null);
    console.log('[Admin Controller] req.body:', req.body);

    try {
        if (!req.file) {
            console.warn('[Admin Controller] Rejected: no file on request');
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const { projectName, selectedHeaders, customColumns } = req.body;
        if (!projectName) {
            console.warn('[Admin Controller] Rejected: missing projectName');
            return res.status(400).json({ message: 'Project name is required' });
        }

        // selectedHeaders is sent as a JSON string in FormData
        let parsedSelectedHeaders = [];
        if (selectedHeaders) {
            try { parsedSelectedHeaders = JSON.parse(selectedHeaders); } catch (e) {
                console.warn('[Admin Controller] Failed to parse selectedHeaders JSON:', e.message);
            }
        }

        // customColumns is sent as a JSON string in FormData
        let parsedCustomColumns = [];
        if (customColumns) {
            try { parsedCustomColumns = JSON.parse(customColumns); } catch (e) {
                console.warn('[Admin Controller] Failed to parse customColumns JSON:', e.message);
            }
        }

        const ext = path.extname(req.file.originalname).toLowerCase();
        console.log(`[Admin Controller] Routing "${req.file.originalname}" (ext=${ext}) to ${ext === '.parquet' ? 'parquetService' : 'csvService'}`);

        const project = ext === '.parquet'
            ? await parquetService.processParquetUpload(req.file, projectName, parsedSelectedHeaders, parsedCustomColumns)
            : await csvService.processCsvUpload(req.file, projectName, parsedSelectedHeaders, parsedCustomColumns);

        console.log(`[Admin Controller] Upload succeeded. Project ID: ${project._id}, totalRows: ${project.totalRows}`);
        res.status(201).json({ message: 'Project created and file parsed successfully', project });
    } catch (error) {
        console.error('[Admin Controller] Upload failed:', error);
        res.status(500).json({ message: error.message });
    }
};

exports.deleteProject = async (req, res) => {
    try {
        const { id } = req.params;

        const project = await Project.findById(id);
        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        // Delete all associated data rows
        await DataRow.deleteMany({ projectId: id });

        // Delete the project
        await Project.findByIdAndDelete(id);

        res.status(200).json({ message: 'Project deleted successfully' });
    } catch (error) {
        console.error('Error deleting project:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
