const Project = require('../../../database/models/Project');
const DataRow = require('../../../database/models/DataRow');

exports.getProjects = async (req, res) => {
    try {
        const projects = await Project.find({}, 'name totalRows createdAt validated validatedAt');
        res.status(200).json(projects);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.validateProject = async (req, res) => {
    try {
        const { id } = req.params;

        const project = await Project.findById(id);
        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        project.validated = true;
        project.validatedAt = new Date();
        await project.save();

        res.status(200).json({ message: 'Project validated successfully', project });
    } catch (error) {
        console.error('Error validating project:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getProjectData = async (req, res) => {
    try {
        const { id } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 50, 500);
        const skip = (page - 1) * limit;

        const project = await Project.findById(id);
        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        const rows = await DataRow.find({ projectId: id })
            .skip(skip)
            .limit(limit)
            .lean();

        // Flatten row data + validated status + custom cell values
        // NOTE: .lean() returns Mongoose Map fields as a plain JS Map object.
        // Spreading a Map with {...map} does NOT work — use Object.fromEntries() instead.
        const flatRows = rows.map(r => {
            const dataObj = r.data instanceof Map
                ? Object.fromEntries(r.data)
                : (r.data || {});
            const base = { ...dataObj, _id: r._id, _validated: r.validated, _validatedAt: r.validatedAt };
            return base;
        });

        res.status(200).json({
            project: {
                id: project._id,
                name: project.name,
                headers: project.headers,
                selectedHeaders: project.selectedHeaders,
                customColumns: project.customColumns || [],
                totalRows: project.totalRows,
                validated: project.validated,
                validatedAt: project.validatedAt
            },
            data: flatRows,
            page,
            totalPages: Math.ceil(project.totalRows / limit)
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.validateRow = async (req, res) => {
    try {
        const { id, rowId } = req.params;

        const row = await DataRow.findOne({ _id: rowId, projectId: id });
        if (!row) {
            return res.status(404).json({ message: 'Row not found' });
        }

        row.validated = true;
        row.validatedAt = new Date();
        await row.save();

        res.status(200).json({ message: 'Row validated successfully', validated: true, validatedAt: row.validatedAt });
    } catch (error) {
        console.error('Error validating row:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ── Custom Column: Add ──────────────────────────────────────────────────────
exports.addCustomColumn = async (req, res) => {
    try {
        const { id } = req.params;
        const { colName } = req.body;

        if (!colName || !colName.trim()) {
            return res.status(400).json({ message: 'Column name is required' });
        }

        const project = await Project.findById(id);
        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        const trimmed = colName.trim();
        if (!project.customColumns.includes(trimmed)) {
            project.customColumns.push(trimmed);
            await project.save();
        }

        res.status(200).json({ message: 'Custom column added', customColumns: project.customColumns });
    } catch (error) {
        console.error('Error adding custom column:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ── Custom Column: Remove ───────────────────────────────────────────────────
exports.removeCustomColumn = async (req, res) => {
    try {
        const { id, colName } = req.params;

        const project = await Project.findById(id);
        if (!project) {
            return res.status(404).json({ message: 'Project not found' });
        }

        project.customColumns = project.customColumns.filter(c => c !== colName);
        await project.save();

        res.status(200).json({ message: 'Custom column removed', customColumns: project.customColumns });
    } catch (error) {
        console.error('Error removing custom column:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ── Regular Cell: Update ───────────────────────────────────────────────────
exports.updateRowCell = async (req, res) => {
    try {
        const { id, rowId } = req.params;
        const { field, value } = req.body;

        if (!field) {
            return res.status(400).json({ message: 'field is required' });
        }

        const row = await DataRow.findOne({ _id: rowId, projectId: id });
        if (!row) {
            return res.status(404).json({ message: 'Row not found' });
        }

        row.data.set(field, value ?? '');
        row.markModified('data'); // Required: Mongoose won't detect Map<Mixed> mutation without this
        await row.save();

        res.status(200).json({ message: 'Cell updated' });
    } catch (error) {
        console.error('Error updating row cell:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ── Custom Cell: Update ─────────────────────────────────────────────────────
exports.updateCustomCell = async (req, res) => {
    try {
        const { id, rowId } = req.params;
        const { colName, value } = req.body;

        if (!colName) {
            return res.status(400).json({ message: 'colName is required' });
        }

        const row = await DataRow.findOne({ _id: rowId, projectId: id });
        if (!row) {
            return res.status(404).json({ message: 'Row not found' });
        }

        // Store under __custom__<colName> inside the data Map
        row.data.set(`__custom__${colName}`, value ?? '');
        row.markModified('data'); // Required: Mongoose won't detect Map<Mixed> mutation without this
        await row.save();

        res.status(200).json({ message: 'Custom cell updated' });
    } catch (error) {
        console.error('Error updating custom cell:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
