import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';

const LOCKED_FIELDS = ['audio'];

const AdminUpload = ({ onUploadSuccess }) => {
    const [file, setFile] = useState(null);
    const [projectName, setProjectName] = useState('');
    const [allHeaders, setAllHeaders] = useState([]);
    const [selectedFields, setSelectedFields] = useState([]);
    const [customCols, setCustomCols] = useState([]); // user-typed custom columns
    const [query, setQuery] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [uploading, setUploading] = useState(false);

    const inputRef = useRef(null);
    const dropdownRef = useRef(null);

    const isParquet = (f) => f && f.name.toLowerCase().endsWith('.parquet');

    const parseHeaders = (csvFile) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const firstLine = e.target.result.split('\n')[0].trim();
                const headers = firstLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
                resolve(headers);
            };
            reader.readAsText(csvFile.slice(0, 4096));
        });
    };

    const handleFileChange = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        setFile(f);
        if (isParquet(f)) {
            // Parquet is binary — headers are detected server-side after upload.
            setAllHeaders([]);
            setSelectedFields([]);
            return;
        }
        const headers = await parseHeaders(f);
        setAllHeaders(headers);
        setSelectedFields([...LOCKED_FIELDS.filter(lf => headers.includes(lf))]);
    };

    const suggestions = allHeaders.filter(h =>
        !selectedFields.includes(h) &&
        !LOCKED_FIELDS.includes(h) &&
        h.toLowerCase().includes(query.toLowerCase())
    );

    const addField = (field) => {
        if (!selectedFields.includes(field)) setSelectedFields(prev => [...prev, field]);
        setQuery('');
        setShowDropdown(false);
        inputRef.current?.focus();
    };

    const removeField = (field) => {
        if (LOCKED_FIELDS.includes(field)) return;
        setSelectedFields(prev => prev.filter(f => f !== field));
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && query.trim()) {
            e.preventDefault();
            if (suggestions[0]) {
                // Match found in CSV headers → add as regular field
                addField(suggestions[0]);
            } else {
                // No CSV match → add as custom column
                const trimmed = query.trim();
                if (!customCols.includes(trimmed) && !selectedFields.includes(trimmed)) {
                    setCustomCols(prev => [...prev, trimmed]);
                }
                setQuery('');
                setShowDropdown(false);
            }
        } else if (e.key === 'Backspace' && query === '') {
            // Remove last custom col first, then last regular field
            if (customCols.length > 0) {
                setCustomCols(prev => prev.slice(0, -1));
            } else {
                const removable = selectedFields.filter(f => !LOCKED_FIELDS.includes(f));
                if (removable.length > 0) removeField(removable[removable.length - 1]);
            }
        } else if (e.key === 'Escape') {
            setShowDropdown(false);
        }
    };

    const removeCustomCol = (col) => setCustomCols(prev => prev.filter(c => c !== col));

    useEffect(() => {
        const handler = (e) => {
            if (!dropdownRef.current?.contains(e.target) && !inputRef.current?.contains(e.target))
                setShowDropdown(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // ── Upload ────────────────────────────────────────────────────────────────
    const handleUpload = async () => {
        if (!file || !projectName.trim()) {
            alert('Please enter a project name and select a CSV or Parquet file.');
            return;
        }
        const formData = new FormData();
        formData.append('file', file);
        formData.append('projectName', projectName);
        formData.append('selectedHeaders', JSON.stringify(
            selectedFields.length > 0 ? selectedFields : allHeaders
        ));
        formData.append('customColumns', JSON.stringify(customCols));
        setUploading(true);
        console.log('[AdminUpload] Uploading', { name: file.name, size: file.size, type: file.type, projectName });
        try {
            const token = localStorage.getItem('token');
            const res = await axios.post(`${import.meta.env.VITE_API_URL}/admin/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${token}` }
            });
            console.log('[AdminUpload] Upload succeeded:', res.data);
            alert('Project created successfully!');
            setFile(null); setProjectName(''); setSelectedFields([]); setAllHeaders([]);
            setQuery(''); setCustomCols([]);
            if (onUploadSuccess) onUploadSuccess();
        } catch (error) {
            console.error('[AdminUpload] Upload failed. Status:', error.response?.status, 'Data:', error.response?.data, 'Full error:', error);
            alert('Upload failed: ' + (error.response?.data?.message || error.message || 'Unknown error'));
        } finally {
            setUploading(false);
        }
    };

    const fieldStyle = {
        width: '100%',
        padding: '12px 16px',
        borderRadius: '8px',
        border: '1.5px solid #d0e3ff',
        fontSize: '0.93em',
        boxSizing: 'border-box',
        outline: 'none',
        backgroundColor: '#fff',
        transition: 'border-color 0.2s',
        color: '#212529',
        fontFamily: 'inherit',
    };

    return (
        <div style={{
            backgroundColor: '#ffffff',
            border: '1.5px solid #cde0ff',
            borderRadius: '16px',
            padding: '32px 40px 28px',
            boxShadow: '0 4px 24px rgba(13,110,253,0.08)',
            width: '100%',
            boxSizing: 'border-box',
        }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Row 1: Project Name */}
                <div style={{ position: 'relative' }}>
                    <span style={{
                        position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
                        fontSize: '1em', pointerEvents: 'none', opacity: 0.4
                    }}>📝</span>
                    <input
                        type="text"
                        placeholder="Project Name"
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        style={{ ...fieldStyle, paddingLeft: '40px', fontWeight: 600 }}
                        onFocus={e => e.target.style.borderColor = '#0d6efd'}
                        onBlur={e => e.target.style.borderColor = '#d0e3ff'}
                    />
                </div>

                {/* Row 2: Upload CSV */}
                <label style={{
                    ...fieldStyle,
                    display: 'flex', alignItems: 'center', gap: '10px',
                    cursor: 'pointer', fontWeight: 600,
                    color: file ? '#212529' : '#6c757d',
                    borderStyle: 'dashed',
                    borderColor: file ? '#0d6efd' : '#d0e3ff',
                    backgroundColor: file ? '#f0f7ff' : '#fafcff',
                    transition: 'all 0.2s',
                }}>
                    <span style={{ fontSize: '1.1em' }}>{file ? '📄' : '📂'}</span>
                    <span style={{ flex: 1 }}>
                        {file
                            ? <>{file.name} <span style={{ fontWeight: 400, color: '#6c757d', fontSize: '0.85em' }}>
                                · {isParquet(file) ? 'columns auto-detected on upload' : `${allHeaders.length} columns detected`}
                              </span></>
                            : 'Upload CSV or Parquet — click to browse'
                        }
                    </span>
                    {file && (
                        <span
                            onClick={(e) => { e.preventDefault(); setFile(null); setAllHeaders([]); setSelectedFields([]); }}
                            style={{ fontSize: '1em', color: '#dc3545', fontWeight: 'bold', cursor: 'pointer' }}
                        >×</span>
                    )}
                    <input type="file" accept=".csv,.parquet" onChange={handleFileChange} style={{ display: 'none' }} />
                </label>

                {/* Row 3: Select Fields */}
                <div style={{ position: 'relative' }}>
                    <div
                        onClick={() => { if (allHeaders.length > 0) { inputRef.current?.focus(); setShowDropdown(true); } }}
                        style={{
                            ...fieldStyle,
                            display: 'flex', flexWrap: 'wrap', gap: '6px',
                            alignItems: 'center', minHeight: '48px',
                            cursor: allHeaders.length > 0 ? 'text' : 'default',
                            backgroundColor: allHeaders.length === 0 ? '#f8faff' : '#fff',
                            borderColor: showDropdown ? '#0d6efd' : '#d0e3ff',
                        }}
                    >
                        {selectedFields.length === 0 && query === '' && (
                            <span style={{ color: '#6c757d', fontWeight: 600, pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span>🗂</span>
                                {isParquet(file)
                                    ? 'Parquet file — all columns will be included automatically'
                                    : allHeaders.length === 0 ? 'Select Fields (upload a CSV first)' : 'Select Fields — type to search…'}
                            </span>
                        )}

                        {selectedFields.map(field => {
                            const locked = LOCKED_FIELDS.includes(field);
                            return (
                                <span key={field} style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                    backgroundColor: locked ? '#6c757d' : '#0d6efd',
                                    color: '#fff', borderRadius: '20px',
                                    padding: '3px 12px', fontSize: '0.8em', fontWeight: 600,
                                    boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                                }}>
                                    {field}
                                    {!locked && (
                                        <span
                                            onMouseDown={(e) => { e.preventDefault(); removeField(field); }}
                                            style={{ cursor: 'pointer', marginLeft: '4px', fontWeight: 'bold', opacity: 0.8 }}
                                        >×</span>
                                    )}
                                </span>
                            );
                        })}

                        {/* Custom column chips — same style as regular */}
                        {customCols.map(col => (
                            <span key={`__custom__${col}`} style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                backgroundColor: '#0d6efd',
                                color: '#fff', borderRadius: '20px',
                                padding: '3px 12px', fontSize: '0.8em', fontWeight: 600,
                                boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                            }}>
                                {col}
                                <span
                                    onMouseDown={(e) => { e.preventDefault(); removeCustomCol(col); }}
                                    style={{ cursor: 'pointer', marginLeft: '4px', fontWeight: 'bold', opacity: 0.8 }}
                                >×</span>
                            </span>
                        ))}

                        {allHeaders.length > 0 && (
                            <input
                                ref={inputRef}
                                value={query}
                                onChange={(e) => { setQuery(e.target.value); setShowDropdown(true); }}
                                onFocus={() => setShowDropdown(true)}
                                onKeyDown={handleKeyDown}
                                style={{
                                    border: 'none', outline: 'none',
                                    fontSize: '0.88em', minWidth: '140px', flex: 1,
                                    backgroundColor: 'transparent', fontFamily: 'inherit',
                                }}
                                placeholder={selectedFields.length <= LOCKED_FIELDS.length && customCols.length === 0 ? 'Search CSV columns or type new name + Enter…' : ''}
                            />
                        )}
                    </div>

                    {/* Dropdown */}
                    {showDropdown && suggestions.length > 0 && (
                        <div
                            ref={dropdownRef}
                            style={{
                                position: 'absolute', top: '100%', left: 0, right: 0,
                                marginTop: '4px', backgroundColor: '#fff',
                                border: '1.5px solid #d0e3ff', borderRadius: '10px',
                                boxShadow: '0 8px 24px rgba(13,110,253,0.12)', zIndex: 999,
                                maxHeight: '240px', overflowY: 'auto',
                            }}
                        >
                            {suggestions.map((s, i) => (
                                <div
                                    key={s}
                                    onMouseDown={(e) => { e.preventDefault(); addField(s); }}
                                    style={{
                                        padding: '9px 16px', cursor: 'pointer',
                                        fontSize: '0.87em', fontFamily: 'monospace',
                                        borderBottom: i < suggestions.length - 1 ? '1px solid #f0f4ff' : 'none',
                                        backgroundColor: i === 0 ? '#eef4ff' : 'transparent',
                                        color: '#212529',
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#eef4ff'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = i === 0 ? '#eef4ff' : 'transparent'}
                                >
                                    {s}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Quick actions */}
                    {allHeaders.length > 0 && (
                        <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '0.8em' }}>
                            <button
                                onClick={() => setSelectedFields([...new Set([...LOCKED_FIELDS.filter(f => allHeaders.includes(f)), ...allHeaders.filter(h => !LOCKED_FIELDS.includes(h))])])}
                                style={{ background: 'none', border: 'none', color: '#0d6efd', cursor: 'pointer', padding: 0, fontWeight: 600, textDecoration: 'underline', fontSize: 'inherit' }}
                            >
                                Add all ({allHeaders.length})
                            </button>
                            <span style={{ marginLeft: 'auto', color: '#6c757d' }}>
                                {selectedFields.length} field{selectedFields.length !== 1 ? 's' : ''} selected
                            </span>
                        </div>
                    )}
                </div>


                {/* Upload button */}
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4px' }}>
                    <button
                        onClick={handleUpload}
                        disabled={uploading}
                        style={{
                            background: uploading ? '#adb5bd' : 'linear-gradient(135deg, #0d6efd, #0a58ca)',
                            color: '#fff', border: 'none', padding: '10px 52px',
                            borderRadius: '24px', cursor: uploading ? 'not-allowed' : 'pointer',
                            fontWeight: 700, fontSize: '0.95em',
                            boxShadow: uploading ? 'none' : '0 4px 14px rgba(13,110,253,0.3)',
                            transition: 'all 0.2s', letterSpacing: '0.3px',
                        }}
                    >
                        {uploading ? '⏳ Uploading…' : 'Upload'}
                    </button>
                </div>

            </div>
        </div>
    );
};

export default AdminUpload;
