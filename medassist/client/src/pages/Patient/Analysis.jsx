import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { useLang } from '../../context/LanguageContext';
import api from '../../services/api';
import AgentStatusPanel from '../../components/AgentStatus/AgentStatusPanel';
import ShareModal from '../../components/ShareModal';
import ReportChatbot from '../../components/ReportChatbot';
import ParameterProgress from '../../components/ParameterProgress';
import { playAudio, stopAudio as stopGlobalAudio } from '../../utils/audioManager';

const STATUS_STYLE = {
  normal:        'bg-emerald-50 text-emerald-700',
  low:           'bg-amber-50 text-amber-700',
  high:          'bg-orange-50 text-orange-700',
  critical_low:  'bg-red-50 text-red-700 font-semibold',
  critical_high: 'bg-red-100 text-red-800 font-bold',
};
const COMPLEXITY_STYLE = {
  Low:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  Medium: 'bg-amber-50 text-amber-700 border-amber-200',
  High:   'bg-red-50 text-red-700 border-red-200',
};

function Section({ title, icon, children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow p-6 space-y-4 animate-slide-up flex flex-col ${className}`}>
      <h2 className="text-base font-bold font-display text-slate-800 border-b border-slate-200 pb-3 flex items-center gap-2 shrink-0">
        {icon && <span className="text-lg">{icon}</span>}
        {title}
      </h2>
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </div>
  );
}

export default function Analysis() {
  const { state } = useLocation();
  const { reportId: paramReportId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { lang } = useLang();

  const { extractedValues, sessionId, disease } = state || {};
  const reportId = paramReportId || state?.reportId;

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [fetched, setFetched] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [riskScores, setRiskScores] = useState(null);
  const [followUp, setFollowUp] = useState(null);
  const [loadingRisk, setLoadingRisk] = useState(false);
  const [loadingFollowUp, setLoadingFollowUp] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [summaryExporting, setSummaryExporting] = useState(false);
  const [supplementLogs, setSupplementLogs] = useState(new Set());
  const [supplementStreaks, setSupplementStreaks] = useState(new Map());

  const [isNarrating, setIsNarrating] = useState(false);
  const [isLoadingNarration, setIsLoadingNarration] = useState(false);

  const [explainModal, setExplainModal] = useState({ open: false, loading: false, text: '', parameter: '' });
  const [translatedData, setTranslatedData] = useState(null);
  const [translating, setTranslating] = useState(false);
  const translatedForRef = useRef('');

  const VISIT_LABEL = {
    not_needed:           t('analysis.routineCheckup'),
    recommended_soon:     t('analysis.scheduleVisit'),
    visit_within_2_weeks: t('analysis.visitSoon'),
    immediate:            t('analysis.visitImmediate'),
  };

  if (!reportId) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="w-20 h-20 bg-teal-50 rounded-3xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-10 h-10 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
        </div>
        <p className="text-slate-500 mb-4">{t('analysis.noReport')}</p>
        <button
          onClick={() => navigate('/patient/upload-report')}
          className="bg-gradient-to-r from-teal-600 to-teal-500 text-white px-6 py-2.5 rounded-xl font-semibold hover:from-teal-700 hover:to-teal-600 shadow-md"
        >
          {t('analysis.uploadReport')}
        </button>
      </div>
    );
  }

  useEffect(() => {
    if (fetched) return;
    setFetched(true);
    setLoading(true);

    let pollTimer = null;
    let cancelled = false;

    const applyResult = (data) => {
      if (cancelled) return;
      setResult(data);
      if (data.riskScores) setRiskScores(data.riskScores);
      if (data.followUp) setFollowUp(data.followUp);
      setLoading(false);
    };

    const pollForResult = () => {
      if (cancelled) return;
      api.get(`/blood-report/${reportId}`)
        .then(({ data }) => {
          if (cancelled) return;
          const a = data.analysis;
          if (a && (a.summary || a.abnormal_findings?.length > 0 || a.diet_plan)) {
            applyResult({
              reportId: data.id,
              analysis: a,
              doctorReferralNeeded: data.complexity_flag || false,
              riskScores: data.risk_scores || null,
              followUp: data.follow_up || null,
            });
          } else {
            pollTimer = setTimeout(pollForResult, 5000);
          }
        })
        .catch(() => {
          if (!cancelled) pollTimer = setTimeout(pollForResult, 5000);
        });
    };

    api.post('/blood-report/analyze', { reportId })
      .then((res) => applyResult(res.data))
      .catch(() => {
        if (!cancelled) pollForResult();
      });

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRiskScores = async () => {
    setLoadingRisk(true);
    try {
      const { data } = await api.post('/blood-report/risk-scores', { reportId });
      setRiskScores(data.riskScores);
    } catch (err) {
      toast.error('Risk scoring failed');
    } finally {
      setLoadingRisk(false);
    }
  };

  const handleFollowUp = async () => {
    setLoadingFollowUp(true);
    try {
      const { data } = await api.post('/blood-report/follow-up', { reportId });
      setFollowUp(data.followUp);
    } catch (err) {
      toast.error('Follow-up generation failed');
    } finally {
      setLoadingFollowUp(false);
    }
  };

  useEffect(() => {
    if (!result) return;
    if (!riskScores) handleRiskScores();
    if (!followUp) handleFollowUp();
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!result) return;
    api.get('/patient/supplement-log')
      .then(({ data }) => {
        setSupplementLogs(new Set(data.today || []));
        setSupplementStreaks(new Map(Object.entries(data.streaks || {})));
      })
      .catch(() => {});
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const endpoint = sessionId
        ? `/patient/sessions/${sessionId}/export-pdf?lang=${lang}`
        : `/blood-report/${reportId}/export-pdf?lang=${lang}`;
      const filename = sessionId
        ? `MedAssist_Report_${sessionId.slice(0, 8)}.pdf`
        : `MedAssist_BloodReport_${reportId}.pdf`;

      const response = await api.get(endpoint, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch (err) {
      toast.error('PDF export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleNarrate = async () => {
    if (isNarrating) {
      stopGlobalAudio();
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      setIsNarrating(false);
      return;
    }

    if (lang === 'es') {
      const summaryText = translatedData?.overall_assessment ?? summary?.overall_assessment;
      if (!summaryText) { toast.error('No hay resumen disponible.'); return; }
      setIsNarrating(true);
      const utterance = new SpeechSynthesisUtterance(summaryText);
      utterance.lang = 'es-ES';
      utterance.rate = 0.95;
      const voices = window.speechSynthesis.getVoices();
      const esVoice = voices.find((v) => v.lang.startsWith('es'));
      if (esVoice) utterance.voice = esVoice;
      utterance.onend = () => setIsNarrating(false);
      utterance.onerror = () => setIsNarrating(false);
      window.speechSynthesis.speak(utterance);
      return;
    }

    setIsLoadingNarration(true);
    try {
      const response = await api.post(
        '/voice/narrate-report',
        { reportId },
        { responseType: 'arraybuffer' }
      );
      const blob = new Blob([response.data], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      playAudio(url, {
        onEnd: () => { setIsNarrating(false); URL.revokeObjectURL(url); },
        onStop: () => setIsNarrating(false),
      });
      setIsNarrating(true);
    } catch (err) {
      toast.error('Could not generate narration. Try again.');
    } finally {
      setIsLoadingNarration(false);
    }
  };

  const handleSummaryCard = async () => {
    setSummaryExporting(true);
    try {
      const response = await api.get(`/blood-report/${reportId}/summary-card?lang=${lang}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `MedAssist_Summary_${reportId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Summary card downloaded');
    } catch {
      toast.error('Summary card generation failed');
    } finally {
      setSummaryExporting(false);
    }
  };

  const handleToggleSupplement = async (ingredientName) => {
    try {
      const { data } = await api.post('/patient/supplement-log', { ingredient_name: ingredientName });
      setSupplementLogs((prev) => {
        const next = new Set(prev);
        if (data.taken) next.add(ingredientName);
        else next.delete(ingredientName);
        return next;
      });
    } catch {
      toast.error('Could not update supplement log');
    }
  };

  const handleExplainFinding = async (finding) => {
    setExplainModal({ open: true, loading: true, text: '', parameter: finding.parameter });
    try {
      const { data } = await api.post('/voice/explain-finding', {
        parameter: finding.parameter,
        your_value: finding.your_value,
        normal_range: finding.normal_range,
        status: finding.status,
        interpretation: finding.interpretation,
        lang,
      });
      setExplainModal((m) => ({ ...m, loading: false, text: data.explanation }));
    } catch {
      setExplainModal((m) => ({ ...m, loading: false, text: t('analysis.aiDisclaimer') }));
    }
  };

  const buildTranslationBatch = () => {
    const texts = {};
    if (!result) return texts;
    const { analysis: a } = result;
    const sum = a?.summary;
    if (sum?.overall_assessment) texts.overall_assessment = sum.overall_assessment;
    if (sum?.root_cause) texts.root_cause = sum.root_cause;
    (a?.abnormal_findings || []).forEach((f, i) => {
      if (f.interpretation) texts[`finding_${i}_interp`] = f.interpretation;
    });
    if (riskScores) {
      if (riskScores.summary) texts.risk_summary = riskScores.summary;
      (riskScores.breakdown || []).forEach((b, bi) => {
        if (b.area) texts[`risk_area_${bi}`] = b.area;
        if (b.note) texts[`risk_note_${bi}`] = b.note;
      });
    }
    const fuArr = followUp ? (Array.isArray(followUp) ? followUp : [followUp]) : [];
    fuArr.forEach((item, i) => {
      const test = item.test || item.name;
      if (test) texts[`followup_${i}_test`] = test;
      const recheck = item.recheck_in || item.timeframe;
      if (recheck) texts[`followup_${i}_recheck`] = recheck;
      if (item.reason) texts[`followup_${i}_reason`] = item.reason;
    });
    if (a?.diet_plan) {
      if (a.diet_plan.overview) texts.diet_overview = a.diet_plan.overview;
      (a.diet_plan.meal_schedule || []).forEach((m, i) => {
        if (m.meal) texts[`meal_${i}_name`] = m.meal;
        if (m.suggestion) texts[`meal_${i}_sugg`] = m.suggestion;
      });
      (a.diet_plan.foods_to_eat || []).forEach((f, i) => {
        if (f.food) texts[`eat_${i}_food`] = f.food;
        if (f.reason) texts[`eat_${i}_reason`] = f.reason;
        if (f.frequency) texts[`eat_${i}_freq`] = f.frequency;
      });
      (a.diet_plan.foods_to_avoid || []).forEach((f, i) => {
        if (f.food) texts[`avoid_${i}_food`] = f.food;
        if (f.reason) texts[`avoid_${i}_reason`] = f.reason;
      });
    }
    (a?.recovery_ingredients || []).forEach((item, i) => {
      if (item.benefit) texts[`ingr_${i}_benefit`] = item.benefit;
      if (item.how_to_use) texts[`ingr_${i}_how`] = item.how_to_use;
      (item.targets || []).forEach((tg, j) => {
        if (tg) texts[`ingr_${i}_target_${j}`] = tg;
      });
    });
    return texts;
  };

  const translateAll = async () => {
    setTranslating(true);
    try {
      const texts = buildTranslationBatch();
      const entries = Object.entries(texts);
      if (!entries.length) return;

      const CHUNK = 20;
      const chunks = [];
      for (let i = 0; i < entries.length; i += CHUNK) {
        chunks.push(Object.fromEntries(entries.slice(i, i + CHUNK)));
      }

      const results = await Promise.allSettled(
        chunks.map((chunk) =>
          api.post('/voice/translate', { lang, texts: chunk }).then((r) => r.data)
        )
      );

      const merged = {};
      results.forEach((r) => { if (r.status === 'fulfilled') Object.assign(merged, r.value); });
      if (Object.keys(merged).length) setTranslatedData(merged);
    } catch {
      // Falls back to English silently
    } finally {
      setTranslating(false);
    }
  };

  useEffect(() => {
    if (lang !== 'es' || !result) {
      setTranslatedData(null);
      translatedForRef.current = '';
      return;
    }
    const key = `${lang}:${!!result}:${!!riskScores}:${!!followUp}`;
    if (translatedForRef.current === key) return;
    translatedForRef.current = key;
    translateAll();
  }, [lang, result, riskScores, followUp]); // eslint-disable-line react-hooks/exhaustive-deps

  const { analysis, doctorReferralNeeded } = result || {};
  const summary = analysis?.summary;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-400">
        <button onClick={() => navigate('/patient/dashboard')} className="hover:text-teal-600 transition-colors">
          {t('analysis.breadcrumbReports')}
        </button>
        {sessionId && (
          <>
            <span className="text-slate-300">/</span>
            <button onClick={() => navigate(`/patient/upload-report/${sessionId}`)} className="hover:text-teal-600 transition-colors">
              {t('analysis.breadcrumbUpload')}
            </button>
          </>
        )}
        <span className="text-slate-300">/</span>
        <span className="text-slate-600 font-medium">{t('analysis.breadcrumbAnalysis')}</span>
      </nav>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold font-display text-slate-800">{t('analysis.bloodReportAnalysis')}</h1>
              {translating && (
                <span className="flex items-center gap-1 text-xs text-teal-500">
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  {lang === 'es' ? 'Traduciendo…' : 'Translating…'}
                </span>
              )}
            </div>
          </div>
          {!loading && result && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleNarrate}
                disabled={isLoadingNarration}
                className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl transition-all shadow-sm disabled:opacity-50"
              >
                {isLoadingNarration ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    {t('analysis.analyzing')}
                  </>
                ) : isNarrating ? (
                  <>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                    </svg>
                    {t('analysis.stopReading')}
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                    {t('analysis.readResults')}
                  </>
                )}
              </button>
              <button
                onClick={handleExportPDF}
                disabled={exporting}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl transition-all shadow-sm disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {exporting ? t('common.loading') : t('analysis.exportPdf')}
              </button>
              <button
                onClick={handleSummaryCard}
                disabled={summaryExporting}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-all shadow-sm disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {summaryExporting ? t('analysis.generating') : t('analysis.printSummaryCard')}
              </button>
              <button
                onClick={() => setShowShareModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold rounded-xl transition-all shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                {t('analysis.share')}
              </button>
            </div>
          )}
        </div>
        <div className="mt-3 p-3 bg-amber-50/80 border border-amber-200/60 rounded-xl text-xs text-amber-700">
          {t('analysis.educationalDisclaimer')}
        </div>
      </div>

      {/* Share Modal */}
      {showShareModal && (
        <ShareModal sessionId={sessionId || reportId} onClose={() => setShowShareModal(false)} />
      )}

      {/* Explain This Modal */}
      {explainModal.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setExplainModal({ open: false, loading: false, text: '', parameter: '' })}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-800">{explainModal.parameter}</h3>
                <p className="text-xs text-teal-600 mt-0.5">{t('analysis.plainEnglish')}</p>
              </div>
              <button
                onClick={() => setExplainModal({ open: false, loading: false, text: '', parameter: '' })}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 shrink-0"
              >
                ✕
              </button>
            </div>

            {explainModal.loading ? (
              <div className="flex items-center gap-3 py-4">
                <div className="w-5 h-5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin shrink-0" />
                <p className="text-sm text-slate-500">{t('analysis.gettingExplanation')}</p>
              </div>
            ) : (
              <p className="text-slate-700 leading-relaxed">{explainModal.text}</p>
            )}

            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs text-slate-400">{t('analysis.aiDisclaimer')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          <AgentStatusPanel sessionId={reportId} />
          <div className="bg-white rounded-2xl border border-slate-200 shadow p-8 flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
            <div className="text-center">
              <p className="font-medium text-slate-700">{t('analysis.agentRunning')}</p>
              <p className="text-sm text-slate-400 mt-1">{t('analysis.agentChecking')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {!loading && result && (
        <>
          {/* Row 1: Overall Summary + Abnormal Findings */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Summary */}
          <Section title={t('analysis.overallSummary')} icon="📊">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <p className="text-slate-700 leading-relaxed">{translatedData?.overall_assessment ?? summary?.overall_assessment}</p>
                {summary?.root_cause && (
                  <p className="text-sm text-slate-500 mt-2">
                    <span className="font-semibold text-slate-700">{t('analysis.rootCause')}: </span>
                    {translatedData?.root_cause ?? summary.root_cause}
                  </p>
                )}
              </div>
              {summary?.complexity && (
                <span className={`px-3 py-1.5 rounded-xl text-sm font-bold shrink-0 border ${COMPLEXITY_STYLE[summary.complexity] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                  {summary.complexity} {t('analysis.complexity')}
                </span>
              )}
            </div>
          </Section>

          {/* Abnormal Findings */}
          {analysis?.abnormal_findings?.length > 0 && (
            <Section title={`${t('analysis.abnormalFindings')} (${analysis.abnormal_findings.length})`} icon="🔬" className="max-h-[665px]">
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto -mx-2 rounded-lg">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="text-left text-[11px] text-slate-400 border-b border-slate-200">
                      <th className="py-1.5 px-1.5 font-medium">{t('analysis.parameterCol')}</th>
                      <th className="py-1.5 px-1.5 font-medium">{t('analysis.valueCol')}</th>
                      <th className="py-1.5 px-1.5 font-medium">{t('analysis.normalCol')}</th>
                      <th className="py-1.5 px-1.5 font-medium">{t('analysis.statusCol')}</th>
                      <th className="py-1.5 px-1.5 font-medium">{t('analysis.interpretationCol')}</th>
                      <th className="py-1.5 px-1.5 font-medium w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {analysis.abnormal_findings.map((f, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-1.5 px-1.5 font-medium text-slate-800 whitespace-nowrap">{f.parameter}</td>
                        <td className="py-1.5 px-1.5 font-mono font-semibold whitespace-nowrap">{f.your_value}</td>
                        <td className="py-1.5 px-1.5 text-slate-500 font-mono whitespace-nowrap">{f.normal_range}</td>
                        <td className="py-1.5 px-1.5 whitespace-nowrap">
                          <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${STATUS_STYLE[f.status] || 'bg-slate-100 text-slate-600'}`}>
                            {f.status ? t(`analysis.statusLabels.${f.status}`, { defaultValue: f.status }) : f.status}
                          </span>
                        </td>
                        <td className="py-1.5 px-1.5 text-slate-600 max-w-[180px] truncate" title={translatedData?.[`finding_${i}_interp`] ?? f.interpretation}>{translatedData?.[`finding_${i}_interp`] ?? f.interpretation}</td>
                        <td className="py-1.5 px-1.5">
                          <button
                            onClick={() => handleExplainFinding(f)}
                            className="w-6 h-6 rounded-full bg-teal-50 hover:bg-teal-100 text-teal-600 text-xs font-bold flex items-center justify-center transition-colors"
                            title={t('analysis.plainEnglish')}
                          >
                            ?
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
          </div>

          {/* Row 2: Clinical Risk Score + Follow-up Schedule */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {loadingRisk && !riskScores && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow p-6 flex items-center gap-4">
              <div className="w-8 h-8 border-4 border-teal-400 border-t-transparent rounded-full animate-spin shrink-0" />
              <div>
                <p className="font-semibold text-slate-700 text-sm">{t('analysis.calculatingRisk')}</p>
                <p className="text-xs text-slate-400 mt-0.5">{t('analysis.riskModels')}</p>
              </div>
            </div>
          )}
          {loadingFollowUp && !followUp && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow p-6 flex items-center gap-4">
              <div className="w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
              <div>
                <p className="font-semibold text-slate-700 text-sm">{t('analysis.generatingFollowUp')}</p>
                <p className="text-xs text-slate-400 mt-0.5">{t('analysis.personalizedRecs')}</p>
              </div>
            </div>
          )}
          {riskScores && (() => {
            const s = riskScores.composite_score ?? null;
            const level = riskScores.risk_level || 'Unknown';
            const visit = riskScores.hospital_visit || 'recommended_soon';
            const breakdown = riskScores.breakdown || [];

            const LEVEL_STYLE = {
              Low:      { ring: 'text-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
              Moderate: { ring: 'text-amber-500',   bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
              High:     { ring: 'text-orange-500',  bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-200' },
              Critical: { ring: 'text-red-500',     bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200' },
            };
            const ls = LEVEL_STYLE[level] || LEVEL_STYLE.Moderate;

            return (
              <Section title={t('analysis.riskScore')} icon="📈">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div className="relative w-32 h-32 shrink-0">
                    <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
                      <circle cx="60" cy="60" r="52" fill="none" stroke="#e2e8f0" strokeWidth="10" />
                      <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" className={ls.ring} strokeWidth="10"
                        strokeDasharray={`${(s || 0) * 3.267} 326.7`}
                        strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className={`text-3xl font-bold font-display ${ls.ring}`}>{s ?? '—'}</span>
                      <span className="text-[10px] text-slate-400 font-medium">/100</span>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0 text-center sm:text-left">
                    <span className={`inline-block px-3 py-1 rounded-xl text-xs font-bold border ${ls.bg} ${ls.text} ${ls.border}`}>
                      {t(`analysis.riskLevels.${level.toLowerCase()}`, { defaultValue: `${level} Risk` })}
                    </span>
                    <p className="text-slate-700 text-sm mt-2 leading-relaxed">{translatedData?.risk_summary ?? riskScores.summary}</p>
                    <p className={`text-xs font-semibold mt-2 ${ls.text}`}>
                      {VISIT_LABEL[visit] || visit}
                    </p>
                  </div>
                </div>

                {breakdown.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    {breakdown.map((b, bi) => {
                      const bScore = b.score ?? 0;
                      const bColor = bScore >= 76 ? 'bg-red-500' : bScore >= 51 ? 'bg-orange-400' : bScore >= 26 ? 'bg-amber-400' : 'bg-emerald-500';
                      return (
                        <div key={b.area} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                          <p className="text-xs font-semibold text-slate-700">{translatedData?.[`risk_area_${bi}`] ?? b.area}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                              <div className={`h-2 rounded-full ${bColor}`} style={{ width: `${bScore}%` }} />
                            </div>
                            <span className="text-xs font-bold text-slate-600 w-7 text-right">{b.score ?? '—'}</span>
                          </div>
                          {b.note && <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">{translatedData?.[`risk_note_${bi}`] ?? b.note}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>
            );
          })()}

          {/* Follow-up Schedule */}
          {followUp && (
            <Section title={t('analysis.followUp')} icon="📅">
              <div className="space-y-3">
                {(Array.isArray(followUp) ? followUp : [followUp]).map((item, i) => (
                  <div key={i} className="flex items-start gap-3 bg-amber-50/50 border border-amber-100 rounded-xl p-4">
                    <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-amber-700">{i + 1}</span>
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">{(translatedData?.[`followup_${i}_test`] ?? (item.test || item.name)) || t('analysis.followUp')}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {t('analysis.recheckIn')}: <span className="font-semibold text-amber-700">{translatedData?.[`followup_${i}_recheck`] ?? (item.recheck_in || item.timeframe || 'TBD')}</span>
                      </p>
                      {item.reason && <p className="text-xs text-slate-400 mt-1">{translatedData?.[`followup_${i}_reason`] ?? item.reason}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}
          </div>

          {/* Parameter Progress gauges */}
          {result?.analysis?.abnormal_findings?.length > 0 && (
            <ParameterProgress extractedValues={result.analysis.abnormal_findings.map((f) => ({
              parameter: f.parameter,
              your_value: f.your_value,
              normal_range: f.normal_range,
              status: f.status,
              unit: f.unit,
            }))} />
          )}

          {/* Row 3: Personalized Diet Plan + Recovery Ingredients */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {analysis?.diet_plan && (
            <Section title={t('analysis.dietPlan')} icon="🥗" className="max-h-[600px]">
              <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
                {analysis.diet_plan.overview && (
                  <p className="text-slate-600 text-sm">{translatedData?.diet_overview ?? analysis.diet_plan.overview}</p>
                )}
                {analysis.diet_plan.meal_schedule?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-2">{t('analysis.mealSchedule')}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {analysis.diet_plan.meal_schedule.map((m, i) => (
                        <div key={i} className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-3">
                          <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-1">{translatedData?.[`meal_${i}_name`] ?? m.meal}</p>
                          <p className="text-sm text-slate-700">{translatedData?.[`meal_${i}_sugg`] ?? m.suggestion}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {analysis.diet_plan.foods_to_eat?.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-emerald-700 mb-2">{t('analysis.foodsToEat')}</h3>
                      <ul className="space-y-2">
                        {analysis.diet_plan.foods_to_eat.map((f, i) => (
                          <li key={i} className="bg-emerald-50/50 rounded-xl p-2.5 border border-emerald-100">
                            <p className="font-medium text-slate-800 text-sm">{translatedData?.[`eat_${i}_food`] ?? f.food}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{translatedData?.[`eat_${i}_reason`] ?? f.reason}</p>
                            {f.frequency && (
                              <p className="text-xs text-emerald-600 mt-0.5 font-medium">{translatedData?.[`eat_${i}_freq`] ?? f.frequency}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {analysis.diet_plan.foods_to_avoid?.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-red-600 mb-2">{t('analysis.foodsToAvoid')}</h3>
                      <ul className="space-y-2">
                        {analysis.diet_plan.foods_to_avoid.map((f, i) => (
                          <li key={i} className="bg-red-50/50 rounded-xl p-2.5 border border-red-100">
                            <p className="font-medium text-slate-800 text-sm">{translatedData?.[`avoid_${i}_food`] ?? f.food}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{translatedData?.[`avoid_${i}_reason`] ?? f.reason}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </Section>
          )}

          {analysis?.recovery_ingredients?.length > 0 && (
            <Section title={t('analysis.recoveryIngredients')} icon="🧬" className="max-h-[600px]">
              <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
                {analysis.recovery_ingredients.map((item, i) => {
                  const taken = supplementLogs.has(item.ingredient);
                  const streak = supplementStreaks.get(item.ingredient) || 0;
                  return (
                    <div key={i} className="border border-teal-100 bg-teal-50/50 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-bold text-slate-800">{item.ingredient}</h3>
                        {item.targets?.length > 0 && (
                          <div className="flex flex-wrap gap-1 justify-end">
                            {item.targets.map((tg, j) => (
                              <span key={j} className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-lg font-medium">
                                {translatedData?.[`ingr_${i}_target_${j}`] ?? tg}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <p className="text-sm text-slate-600">{translatedData?.[`ingr_${i}_benefit`] ?? item.benefit}</p>
                      {item.how_to_use && (
                        <p className="text-xs text-teal-700 mt-1.5 font-medium">{t('analysis.howToUse')}: {translatedData?.[`ingr_${i}_how`] ?? item.how_to_use}</p>
                      )}
                      <div className="flex items-center gap-3 mt-3">
                        <button
                          onClick={() => handleToggleSupplement(item.ingredient)}
                          className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
                            taken
                              ? 'bg-teal-600 text-white'
                              : 'bg-white border border-teal-200 text-teal-700 hover:bg-teal-50'
                          }`}
                        >
                          {taken ? t('analysis.takenToday') : t('analysis.markTaken')}
                        </button>
                        {streak > 1 && (
                          <span className="text-xs text-amber-600 font-semibold">
                            🔥 {streak} {t('analysis.dayStreak')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}
          </div>

        </>
      )}

      {/* Floating report chatbot */}
      <ReportChatbot reportId={reportId} />
    </div>
  );
}
