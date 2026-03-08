import { useState, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../services/api';

const ACCEPTED = '.jpg,.jpeg,.png,.pdf';
const MAX_MB = 10;

function StatusBadge({ status }) {
  const map = {
    normal:       'bg-green-100 text-green-700',
    low:          'bg-yellow-100 text-yellow-700',
    high:         'bg-orange-100 text-orange-700',
    critical_low: 'bg-red-100 text-red-700',
    critical_high:'bg-red-200 text-red-800',
  };
  const label = {
    normal:       'Normal',
    low:          'Low',
    high:         'High',
    critical_low: 'Critical Low',
    critical_high:'Critical High',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {label[status] || status}
    </span>
  );
}

export default function UploadReport() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { sessionId, disease, tests } = state || {};

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null); // data-URL for images
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null); // extracted values from OCR
  const inputRef = useRef();

  const handleFile = (f) => {
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) {
      toast.error(`File too large — max ${MAX_MB} MB`);
      return;
    }
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowed.includes(f.type)) {
      toast.error('Only JPG, PNG, and PDF files are accepted');
      return;
    }
    setFile(f);
    setResult(null);
    if (f.type !== 'application/pdf') {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(f);
    } else {
      setPreview('pdf');
    }
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(0);

    const formData = new FormData();
    formData.append('report', file);
    if (sessionId) formData.append('sessionId', sessionId);

    try {
      const res = await api.post('/blood-report/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          setProgress(Math.round((e.loaded / e.total) * 100));
        },
      });
      setResult(res.data);
      toast.success(`Extracted ${res.data.count} blood parameters`);
    } catch (err) {
      const msg = err.response?.data?.error || 'Upload or OCR failed';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleProceed = () => {
    navigate('/patient/analysis', {
      state: {
        sessionId,
        disease,
        tests,
        reportId: result.reportId,
        extractedValues: result.extractedValues,
      },
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-gray-400">
        <button onClick={() => navigate('/patient/intake')} className="hover:text-blue-600 transition-colors">
          Symptom Intake
        </button>
        <span>›</span>
        <button onClick={() => navigate(-1)} className="hover:text-blue-600 transition-colors">
          Blood Tests
        </button>
        <span>›</span>
        <span className="text-gray-600 font-medium">Upload Report</span>
      </nav>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h1 className="text-xl font-bold text-gray-800">Upload Blood Report</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload your lab report and our AI will extract all values for analysis.
        </p>
        {disease && (
          <p className="text-xs text-blue-600 mt-1 font-medium">
            For: {disease.disease}
          </p>
        )}
        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
          ⚠️ Educational use only. AI extraction may not be 100% accurate. Always verify with your lab report.
        </div>
      </div>

      {/* Drop zone */}
      {!result && (
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => !file && inputRef.current?.click()}
          className={`bg-white rounded-2xl border-2 border-dashed transition-colors cursor-pointer p-10 text-center
            ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}
            ${file ? 'cursor-default' : ''}`}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />

          {!file ? (
            <>
              <div className="text-5xl mb-3">📄</div>
              <p className="font-semibold text-gray-700">Drag & drop your blood report here</p>
              <p className="text-sm text-gray-400 mt-1">or click to browse</p>
              <p className="text-xs text-gray-300 mt-3">JPG, PNG, PDF — max {MAX_MB} MB</p>
            </>
          ) : (
            <div className="space-y-4">
              {preview && preview !== 'pdf' ? (
                <img
                  src={preview}
                  alt="Report preview"
                  className="max-h-64 mx-auto rounded-lg border border-gray-100 object-contain"
                />
              ) : (
                <div className="text-6xl">📑</div>
              )}
              <div>
                <p className="font-semibold text-gray-800">{file.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(null); }}
                className="text-xs text-red-500 hover:text-red-700 underline"
              >
                Remove file
              </button>
            </div>
          )}
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
            <p className="font-medium text-gray-700">
              {progress < 100
                ? `Uploading… ${progress}%`
                : 'Our AI is analyzing your report…'}
            </p>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          {progress === 100 && (
            <p className="text-xs text-gray-400 text-center animate-pulse">
              AI is extracting values from your blood report…
            </p>
          )}
        </div>
      )}

      {/* Analyze button */}
      {file && !uploading && !result && (
        <div className="flex justify-end">
          <button
            onClick={handleUpload}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-xl transition-colors"
          >
            Analyze Report →
          </button>
        </div>
      )}

      {/* Extracted values table */}
      {result && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-800">Extracted Values</h2>
              <p className="text-sm text-gray-500">{result.count} parameters found</p>
            </div>
            <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
              OCR Complete
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="pb-2 font-medium">Parameter</th>
                  <th className="pb-2 font-medium">Value</th>
                  <th className="pb-2 font-medium">Normal Range</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {result.extractedValues.map((v, i) => (
                  <tr key={i} className={v.status !== 'normal' ? 'bg-red-50/30' : ''}>
                    <td className="py-2 pr-4">
                      <span className="font-medium text-gray-800">{v.parameter}</span>
                      {v.abbreviation && (
                        <span className="text-xs text-gray-400 ml-1 font-mono">({v.abbreviation})</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 font-mono font-semibold text-gray-700">
                      {v.value} <span className="text-gray-400 font-normal">{v.unit}</span>
                    </td>
                    <td className="py-2 pr-4 text-gray-500 font-mono text-xs">{v.normal_range}</td>
                    <td className="py-2">
                      <StatusBadge status={v.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Proceed to analysis */}
          <div className="pt-4 border-t border-gray-100 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-700">Next step</p>
              <p className="text-xs text-gray-400">Run the AI Blood Report Agent for medication recommendations</p>
            </div>
            <button
              onClick={handleProceed}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors whitespace-nowrap"
            >
              Get AI Analysis →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
