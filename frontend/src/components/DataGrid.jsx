import React, { useState, useEffect, useCallback } from "react";
import { Resizable } from "re-resizable";
import RSMLEditor from "./RSMLEditor";

import { AgGridReact } from "ag-grid-react";
import axios from "axios";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";

// ─── Audio Cell ───────────────────────────────────────────────────────────────
const getAudioSource = (rowData, field) => {
  const value =
    rowData?.audio_base64 ||
    rowData?.["audio base64"] ||
    rowData?.[field];

  if (!value || typeof value !== "string") return null;
  if (
    value.startsWith("data:") ||
    value.startsWith("http://") ||
    value.startsWith("https://")
  ) {
    return value;
  }

  return `data:audio/wav;base64,${value}`;
};

const DataGrid = ({ projectId }) => {
  const [gridApi, setGridApi] = useState(null);
  const [columnDefs, setColumnDefs] = useState([]);
  const [projectInfo, setProjectInfo] = useState(null);
  const [customColumns, setCustomColumns] = useState([]);
  const [newColName, setNewColName] = useState("");
  const [addingCol, setAddingCol] = useState(false);
  const [rsmlEditorState, setRsmlEditorState] = useState({
    isOpen: false,
    rowData: null,
    rowIndex: -1,
    colId: null,
    node: null,
  });

  // Fetch Project Info (Headers) & Detect Audio Column
  useEffect(() => {
    if (!projectId) return;

    const fetchProjectInfo = async () => {
      try {
        const token = localStorage.getItem("token");
        // Fetch first page to inspect data for audio detection
        const response = await axios.get(
          `${import.meta.env.VITE_API_URL}/viewer/projects/${projectId}?page=1&limit=1`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        const { project, data } = response.data;
        setProjectInfo(project);
        setCustomColumns(project.customColumns || []);

        // Setup Columns
        if (project.headers && project.headers.length > 0) {
          const excludedColumns = [
            "verbatim",
            "normalized",
            "unsanitized_verbatim",
            "unsanitized_normalized",
            "rsml_verbatim",
            "rsml_normalized",
            "sarvam_hypothesis",
            "rsml_sarvam",
            "hypothesis_ccc-wav2vec",
            "rsml_ccc-wav2vec",
            "hypothesis_google",
            "rsml_google",
            "hypothesis_indic_conformer",
            "rsml_indic_conformer",
          ];

          let audioColumnField =
            project.headers.find((header) => header.toLowerCase() === "audio_base64") ||
            project.headers.find((header) => header.toLowerCase() === "audio base64") ||
            null;

          // Heuristic: Check first row data for possible audio content
          if (!audioColumnField && data && data.length > 0) {
            const firstRow = data[0];
            for (const header of project.headers) {
              if (excludedColumns.includes(header)) continue;

              const cellValue = firstRow[header];
              if (
                typeof cellValue === "string" &&
                cellValue.length > 500 &&
                !cellValue.includes(" ")
              ) {
                // Likely base64 audio
                audioColumnField = header;
                break;
              }
            }
          }

          const cols = [];

          const selectedAudioColumn =
            (project.selectedHeaders && project.selectedHeaders.length > 0
              ? project.selectedHeaders
              : project.headers
            ).some((header) => header.toLowerCase() === "audio");

          // 1. Add Synthetic Audio Column if detected and no visible audio column exists
          if (audioColumnField && !selectedAudioColumn) {
            cols.push({
              headerName: "Audio",
              field: audioColumnField, // Use audio field data
              cellRenderer: (params) => {
                let src = params.value;
                if (!src) return null;
                // If it doesn't start with data:, assume it's raw base64 wav/mp3
                if (!src.startsWith("data:")) {
                  src = `data:audio/wav;base64,${src}`;
                }
                return (
                  <audio
                    controls
                    src={src}
                    style={{ height: "30px", marginTop: "5px" }}
                  >
                    Your browser does not support the audio element.
                  </audio>
                );
              },
              width: 300,
              editable: false,
              filter: false,
              pinned: "left",
            });
          }

          const visibleHeaders =
            project.selectedHeaders && project.selectedHeaders.length > 0
              ? project.selectedHeaders
              : project.headers;

          // 2. Add selected columns
          visibleHeaders.forEach((header) => {
            const lowerHeader = header.toLowerCase();
            const colDef = {
              field: header,
              headerName: header.charAt(0).toUpperCase() + header.slice(1),
              editable: true,
              filter: true,
              resizable: true,
            };

            if (lowerHeader === "audio") {
              colDef.editable = false;
              colDef.filter = false;
              colDef.pinned = "left";
              colDef.width = 300;
              colDef.cellRenderer = (params) => {
                const src = getAudioSource(params.data, header);
                if (!src) return params.value || null;
                return (
                  <audio
                    controls
                    preload="none"
                    src={src}
                    style={{ height: "30px", marginTop: "5px", width: "260px" }}
                  >
                    Your browser does not support the audio element.
                  </audio>
                );
              };
            }

            // Hide the source audio column and specific requests
            if (
              header === audioColumnField ||
              lowerHeader === "audio base64" ||
              lowerHeader === "audiopath" ||
              lowerHeader === "audio_base64" ||
              lowerHeader === "audio_path"
            ) {
              colDef.hide = true;
            }

            cols.push(colDef);
          });

          // 3. Add custom columns (user-added)
          if (project.customColumns && project.customColumns.length > 0) {
            project.customColumns.forEach((colName) => {
              cols.push({
                headerName: colName,
                field: `__custom__${colName}`,
                editable: true,
                filter: true,
                resizable: true,
              });
            });
          }

          setColumnDefs(cols);
        }
      } catch (error) {
        console.error("Error fetching project info:", error);
      }
    };

    fetchProjectInfo();
  }, [projectId]);

  // ─── Build column defs helper (called after add/remove) ──────────────────
  const rebuildCustomCols = useCallback((cols) => {
    if (!cols || cols.length === 0) return [];
    return cols.map((colName) => ({
      headerName: colName,
      field: `__custom__${colName}`,
      editable: true,
      filter: true,
      resizable: true,
    }));
  }, []);

  // ─── Add Custom Column ────────────────────────────────────────────────────
  const handleAddCustomColumn = useCallback(async () => {
    const trimmed = newColName.trim();
    if (!trimmed) return;
    if (customColumns.includes(trimmed)) {
      alert(`Column "${trimmed}" already exists.`);
      return;
    }
    setAddingCol(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(
        `${import.meta.env.VITE_API_URL}/viewer/projects/${projectId}/custom-columns`,
        { colName: trimmed },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const updated = res.data.customColumns;
      setCustomColumns(updated);
      setNewColName("");
      // Rebuild columnDefs: preserve non-custom cols, replace custom section
      setColumnDefs((prev) => {
        const nonCustom = prev.filter((c) => !c.field?.startsWith("__custom__"));
        return [...nonCustom, ...rebuildCustomCols(updated)];
      });
    } catch (err) {
      console.error("Error adding custom column:", err);
      alert(err?.response?.data?.message || "Failed to add column.");
    } finally {
      setAddingCol(false);
    }
  }, [newColName, customColumns, projectId, rebuildCustomCols]);

  // ─── Remove Custom Column ─────────────────────────────────────────────────
  const handleRemoveCustomColumn = useCallback(async (colName) => {
    if (!window.confirm(`Remove column "${colName}"?`)) return;
    try {
      const token = localStorage.getItem("token");
      const res = await axios.delete(
        `${import.meta.env.VITE_API_URL}/viewer/projects/${projectId}/custom-columns/${encodeURIComponent(colName)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const updated = res.data.customColumns;
      setCustomColumns(updated);
      setColumnDefs((prev) => {
        const nonCustom = prev.filter((c) => !c.field?.startsWith("__custom__"));
        return [...nonCustom, ...rebuildCustomCols(updated)];
      });
    } catch (err) {
      console.error("Error removing custom column:", err);
      alert("Failed to remove column.");
    }
  }, [projectId, rebuildCustomCols]);

  // ─── Save cell value on edit ──────────────────────────────────────────────
  const handleCellValueChanged = useCallback(async (params) => {
    const { data, colDef, newValue } = params;
    const rowId = data._id;
    const field = colDef.field;
    if (!rowId || !field) return;

    const token = localStorage.getItem("token");
    try {
      if (field.startsWith("__custom__")) {
        const colName = field.replace("__custom__", "");
        await axios.put(
          `${import.meta.env.VITE_API_URL}/viewer/projects/${projectId}/rows/${rowId}/custom-cell`,
          { colName, value: newValue ?? "" },
          { headers: { Authorization: `Bearer ${token}` } },
        );
      } else {
        await axios.put(
          `${import.meta.env.VITE_API_URL}/viewer/projects/${projectId}/rows/${rowId}/cell`,
          { field, value: newValue ?? "" },
          { headers: { Authorization: `Bearer ${token}` } },
        );
      }
    } catch (err) {
      console.error("Error saving cell:", err);
      // Roll back the value in the grid node
      params.node.setDataValue(field, params.oldValue);
    }
  }, [projectId]);

  const handleCellDoubleClicked = useCallback((params) => {
    const field = params.colDef.field;
    const excludedColumns = [
      "verbatim",
      "normalized",
      "unsanitized_verbatim",
      "unsanitized_normalized",
      "rsml_verbatim",
      "rsml_normalized",
      "sarvam_hypothesis",
      "rsml_sarvam",
      "hypothesis_ccc-wav2vec",
      "rsml_ccc-wav2vec",
      "hypothesis_google",
      "rsml_google",
      "hypothesis_indic_conformer",
      "rsml_indic_conformer",
    ];

    if (excludedColumns.includes(field)) {
      const rowData = params.node.data;
      setRsmlEditorState({
        isOpen: true,
        rowData: rowData,
        rowIndex: params.node.rowIndex,
        colId: field,
        node: params.node,
      });
    }
  }, []);

  const handleRsmlSave = (fieldUpdate) => {
    if (rsmlEditorState.node && fieldUpdate) {
      // Update the specific field that was saved
      Object.keys(fieldUpdate).forEach((fieldName) => {
        rsmlEditorState.node.setDataValue(fieldName, fieldUpdate[fieldName]);
      });
    }
  };

  const handleRsmlClose = () => {
    setRsmlEditorState((prev) => ({ ...prev, isOpen: false }));
  };

  const onGridReady = useCallback((params) => {
    setGridApi(params.api);
  }, []);

  // Set Datasource when API and Project Info are ready
  useEffect(() => {
    if (!gridApi || !projectId || !projectInfo) return;

    const dataSource = {
      rowCount: undefined, // let grid calculate
      getRows: async (params) => {
        const { startRow, endRow } = params;
        const pageSize = endRow - startRow;
        const page = Math.floor(startRow / pageSize) + 1;

        console.log(`Fetching page ${page} (rows ${startRow} to ${endRow})`);

        try {
          const token = localStorage.getItem("token");
          const response = await axios.get(
            `${import.meta.env.VITE_API_URL}/viewer/projects/${projectId}?page=${page}&limit=${pageSize}`,
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          );

          const rows = response.data.data;
          const totalRows = response.data.project.totalRows;

          params.successCallback(rows, totalRows);
        } catch (error) {
          console.error("Error fetching rows:", error);
          params.failCallback();
        }
      },
    };

    gridApi.setGridOption("datasource", dataSource);
  }, [gridApi, projectId, projectInfo]);

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <div
        className="card"
        style={{
          maxWidth: "100%",
          padding: "10px",
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            marginBottom: "10px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "8px",
          }}
        >
          <h3 style={{ margin: 0 }}>
            {projectInfo ? projectInfo.name : "Loading..."}
            {projectInfo && (
              <span style={{ fontSize: "0.8em", color: "#666" }}>
                {" "}
                ({projectInfo.totalRows} rows)
              </span>
            )}
          </h3>

          {/* ── Custom Column Toolbar ── */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            {customColumns.map((col) => (
              <span
                key={col}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  background: "#dbeafe",
                  border: "1px solid #93c5fd",
                  borderRadius: "12px",
                  padding: "2px 8px",
                  fontSize: "0.78em",
                  color: "#1e40af",
                  fontWeight: 500,
                }}
              >
                {col}
                <button
                  onClick={() => handleRemoveCustomColumn(col)}
                  title={`Remove column "${col}"`}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#ef4444",
                    fontWeight: "bold",
                    lineHeight: 1,
                    padding: "0 2px",
                    fontSize: "1em",
                  }}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              type="text"
              placeholder="New column name…"
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCustomColumn()}
              style={{
                border: "1px solid #93c5fd",
                borderRadius: "4px",
                padding: "4px 8px",
                fontSize: "0.85em",
                outline: "none",
                width: "160px",
              }}
            />
            <button
              onClick={handleAddCustomColumn}
              disabled={addingCol || !newColName.trim()}
              style={{
                backgroundColor: addingCol || !newColName.trim() ? "#93c5fd" : "#2563eb",
                color: "white",
                border: "none",
                padding: "5px 12px",
                borderRadius: "4px",
                cursor: addingCol || !newColName.trim() ? "not-allowed" : "pointer",
                fontSize: "0.85em",
                fontWeight: 500,
              }}
            >
              {addingCol ? "Adding…" : "+ Add Column"}
            </button>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <Resizable
            defaultSize={{
              width: "100%",
              height: "100%",
            }}
            minHeight="200px"
            enable={{
              top: false,
              right: false,
              bottom: true,
              left: false,
              topRight: false,
              bottomRight: false,
              bottomLeft: false,
              topLeft: false,
            }}
            style={{
              borderBottom: "1px solid #ddd",
              paddingBottom: "10px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              className="ag-theme-quartz"
              style={{ height: "100%", width: "100%", flex: 1 }}
            >
              <AgGridReact
                columnDefs={columnDefs}
                rowModelType="infinite"
                pagination={true}
                paginationPageSize={50}
                cacheBlockSize={50}
                onGridReady={onGridReady}
                onCellDoubleClicked={handleCellDoubleClicked}
                onCellValueChanged={handleCellValueChanged}
                defaultColDef={{
                  sortable: false,
                  filter: false,
                }}
              />
            </div>
          </Resizable>
        </div>
      </div>
      {rsmlEditorState.isOpen && (
        <RSMLEditor
          rowData={rsmlEditorState.rowData}
          columnDefs={columnDefs}
          onSave={handleRsmlSave}
          onClose={handleRsmlClose}
          projectId={projectId}
        />
      )}
    </div>
  );
};

export default DataGrid;
