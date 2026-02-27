import { useState, useEffect } from 'react'
import ProfileResultView from './ProfileResultView'
import ProfileSummary from './ProfileSummary'
import './App.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const STEPS = [
  { id: 1, label: 'Mi CV' },
  { id: 2, label: 'Posición' },
  { id: 3, label: 'CV adaptado' },
]

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function EmptyState({ icon, text }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
      <span className="text-4xl mb-3">{icon}</span>
      <p className="text-sm">{text}</p>
    </div>
  )
}

function Stepper({ currentStep, onStepClick }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((step, i) => {
        const isActive = currentStep === step.id
        const isCompleted = currentStep > step.id
        return (
          <div key={step.id} className="contents">
            <button
              type="button"
              onClick={() => onStepClick(step.id)}
              className={`
                flex items-center gap-2.5 px-5 py-2.5 rounded-full border cursor-pointer
                transition-all duration-200 btn-scale
                ${isActive
                  ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200'
                  : isCompleted
                    ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                    : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-500'
                }
              `}
            >
              <span className={`
                w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold
                ${isActive
                  ? 'bg-white/20 text-white'
                  : isCompleted
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 text-gray-400'
                }
              `}>
                {isCompleted ? '✓' : step.id}
              </span>
              <span className="text-sm font-medium">{step.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div className={`stepper-connector ${isCompleted ? 'stepper-connector--completed' : ''}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function App() {
  /* --- Commented out: link mode state (kept for future use) ---
  const [jobUrl, setJobUrl] = useState('')
  const [summaryMode, setSummaryMode] = useState('link')
  --- */
  const [jdPastedText, setJdPastedText] = useState('')
  const [language, setLanguage] = useState('es')
  const [currentStep, setCurrentStep] = useState(1)
  const [profile, setProfile] = useState(null)
  const [jdSummary, setJdSummary] = useState('')
  const [pdfFilename, setPdfFilename] = useState(null)
  const [docxFilename, setDocxFilename] = useState(null)
  const [generateLoading, setGenerateLoading] = useState(false)
  const [matchResult, setMatchResult] = useState(null)
  const [canGenerateCv, setCanGenerateCv] = useState(false)

  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisPhase, setAnalysisPhase] = useState('')

  const resetAnalysisState = () => {
    setJdSummary('')
    setMatchResult(null)
    setCanGenerateCv(false)
  }
  const [error, setError] = useState(null)

  const [parseFile, setParseFile] = useState(null)
  const [parseAndEnrichLoading, setParseAndEnrichLoading] = useState(false)
  const [parseError, setParseError] = useState(null)
  const [parsedJson, setParsedJson] = useState(null)
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    fetch(`${API}/api/profile`)
      .then((r) => {
        if (!r.ok) throw new Error('No se pudo cargar el perfil')
        return r.json()
      })
      .then(setProfile)
      .catch((e) => setError(e.message))
  }, [])

  const handleAnalyzeAll = async (e) => {
    e.preventDefault()
    if (!jdPastedText.trim()) return
    setError(null)
    setJdSummary('')
    setMatchResult(null)
    setCanGenerateCv(false)
    setAnalysisLoading(true)

    // Phase 1: Summarize JD
    setAnalysisPhase('Analizando la oferta…')
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000)
      const res = await fetch(`${API}/api/jd/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jd_text: jdPastedText.trim() }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      let data
      try {
        data = await res.json()
      } catch (_) {
        throw new Error('La respuesta del servidor no es válida. ¿El backend está corriendo?')
      }
      if (!res.ok) {
        const msg = Array.isArray(data.detail) ? data.detail.map(d => d.msg || d).join(', ') : (data.detail || 'Error al obtener el resumen')
        throw new Error(msg)
      }
      const summary = data.jd_summary != null ? String(data.jd_summary) : ''
      setJdSummary(summary)

      // Phase 2: Match analysis (only if profile exists)
      if (profile) {
        setAnalysisPhase('Evaluando compatibilidad…')
        try {
          const matchRes = await fetch(`${API}/api/cv/match`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile, jd: jdPastedText.trim() }),
          })
          const matchData = await matchRes.json()
          if (!matchRes.ok) throw new Error(matchData.detail || 'Error al analizar el match')
          setMatchResult(matchData)
          setCanGenerateCv(Boolean(matchData.approved))
        } catch (matchErr) {
          setError(matchErr.message)
          setMatchResult(null)
          setCanGenerateCv(false)
        }
      }
    } catch (err) {
      setError(err.name === 'AbortError' ? 'Tardó demasiado. Probá de nuevo.' : err.message)
    } finally {
      setAnalysisLoading(false)
      setAnalysisPhase('')
    }
  }

  /* --- Commented out: link-based summary handler (kept for future use) ---
  const handleFetchSummary = async (e) => {
    e.preventDefault()
    const useUrl = summaryMode === 'link'
    if (useUrl && !jobUrl.trim()) return
    setError(null)
    setSummaryLoading(true)
    try {
      const body = { job_url: jobUrl.trim() }
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 90000)
      const res = await fetch(`${API}/api/jd/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      let data
      try { data = await res.json() } catch (_) {
        throw new Error('La respuesta del servidor no es válida.')
      }
      if (!res.ok) throw new Error(data.detail || 'Error al obtener el resumen')
      setJdSummary(data.jd_summary != null ? String(data.jd_summary) : '')
    } catch (err) {
      setError(err.name === 'AbortError' ? 'Tardó demasiado (máx. 90 s).' : err.message)
    } finally {
      setSummaryLoading(false)
    }
  }
  --- */

  const handleGenerateCv = async (e) => {
    e.preventDefault()
    setError(null)
    setPdfFilename(null)
    setDocxFilename(null)
    setGenerateLoading(true)
    try {
      const res = await fetch(`${API}/api/adapt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Error al generar el CV')
      setPdfFilename(data.pdf_filename ?? null)
      setDocxFilename(data.docx_filename ?? null)
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerateLoading(false)
    }
  }

  const pdfUrl = pdfFilename ? `${API}/api/cv/download/${pdfFilename}` : null
  const pdfPreviewUrl = pdfFilename ? `${API}/api/cv/download/${pdfFilename}?inline=true` : null
  const docxUrl = docxFilename ? `${API}/api/cv/download/${docxFilename}` : null

  const handleParseAndEnrich = async (e, fileFromInput = null) => {
    if (e && e.preventDefault) e.preventDefault()
    const file = fileFromInput ?? parseFile
    if (!file) return
    setParseFile(file)
    setParseError(null)
    setParsedJson(null)
    setSaveSuccess(false)
    setParseAndEnrichLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${API}/api/cv/parse-and-enrich`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail) || 'Error al parsear y enriquecer')
      setParsedJson(data)
    } catch (err) {
      setParseError(err.message)
    } finally {
      setParseAndEnrichLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!parsedJson) return
    setSaveSuccess(false)
    setSaveLoading(true)
    const toSend = { ...parsedJson }
    if (toSend.strategy?.seniority === '_custom') {
      toSend.strategy = { ...toSend.strategy, seniority: toSend.strategy.seniorityCustom ?? '' }
    }
    try {
      const res = await fetch(`${API}/api/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toSend),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Error al guardar')
      setProfile(parsedJson)
      setSaveSuccess(true)
      setError(null)
      setParsedJson(null)
      setParseFile(null)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setParseError(err.message)
    } finally {
      setSaveLoading(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: '#f8fafc' }}>
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">CVago</h1>
            <p className="text-sm text-gray-400 mt-0.5">Generá CVs adaptados a cada oferta laboral.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-green-700 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Backend online
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-6 pt-8 pb-16">
        <Stepper currentStep={currentStep} onStepClick={setCurrentStep} />

        {/* ═══ Step 1: Full-width — upload banner + profile ═══ */}
        {currentStep === 1 && (
          <div className="animate-fade-in space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 card-hover">
              <div className="flex flex-col sm:flex-row items-center gap-5">
                <label className="file-upload-zone rounded-xl px-6 py-5 flex items-center gap-4 flex-1 w-full sm:w-auto cursor-pointer">
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null
                      if (file) handleParseAndEnrich(null, file)
                    }}
                    disabled={parseAndEnrichLoading}
                    className="hidden"
                  />
                  <span className="text-2xl shrink-0">📎</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">
                      {parseFile?.name || 'Subí tu CV para parsear y enriquecer'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">PDF, DOCX o TXT — se parsea y enriquece automáticamente</p>
                  </div>
                </label>
                {parseAndEnrichLoading && (
                  <div className="flex items-center gap-2 text-sm text-blue-600 animate-pulse-soft shrink-0">
                    <Spinner /> Parseando…
                  </div>
                )}
              </div>
              {parseError && (
                <div className="mt-4 px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-100">{parseError}</div>
              )}
              {saveSuccess && (
                <div className="mt-4 px-4 py-3 rounded-xl bg-green-50 text-green-700 text-sm border border-green-100 animate-fade-in">✓ Perfil guardado en data/profile.json</div>
              )}
            </div>

            {parsedJson && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-7 card-hover animate-fade-in">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">Resultado del parsing</h2>
                    <p className="text-sm text-gray-400 mt-0.5">Revisá y editá antes de guardar.</p>
                  </div>
                  <button type="button" className="btn-scale px-5 py-2.5 rounded-xl bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed border-0 cursor-pointer" onClick={handleSaveProfile} disabled={saveLoading}>
                    {saveLoading ? 'Guardando…' : '✓ Guardar como perfil'}
                  </button>
                </div>
                <ProfileResultView data={parsedJson} onChange={setParsedJson} />
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-7">
              {profile ? (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-xl font-semibold text-gray-900">Perfil guardado</h2>
                    <button
                      type="button"
                      className="btn-scale px-4 py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 border border-gray-200 cursor-pointer"
                      onClick={() => setParsedJson(JSON.parse(JSON.stringify(profile)))}
                    >
                      ✎ Editar perfil
                    </button>
                  </div>
                  <ProfileSummary profile={profile} />
                </>
              ) : error && !jdSummary ? (
                <EmptyState icon="⚠️" text="No se pudo cargar el perfil." />
              ) : (
                <EmptyState icon="📄" text="Cargando perfil..." />
              )}
            </div>
          </div>
        )}

        {/* ═══ Step 2: Posición — textarea + single button, 2-col results ═══ */}
        {currentStep === 2 && (
          <div className="animate-fade-in space-y-6">
            {/* Input area */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-7 card-hover">
              <h2 className="text-xl font-semibold text-gray-900 mb-1">Posición y compatibilidad</h2>
              <p className="text-sm text-gray-400 mb-5">Pegá la descripción de la oferta. Se analiza la posición y la compatibilidad con tu perfil en un solo paso.</p>

              {!profile && (
                <div className="mb-5 px-4 py-3 rounded-xl bg-amber-50 text-amber-800 text-sm border border-amber-100">
                  No hay un perfil guardado. Podés analizar ofertas igual, pero la compatibilidad requiere un perfil (Paso 1).
                </div>
              )}

              {error && (
                <div className="mb-5 px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-100">{error}</div>
              )}

              <form onSubmit={handleAnalyzeAll} className="space-y-4">
                <textarea
                  value={jdPastedText}
                  onChange={(e) => { setJdPastedText(e.target.value); resetAnalysisState() }}
                  placeholder="Copiá y pegá el texto completo de la job description..."
                  rows={8}
                  disabled={analysisLoading}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm resize-y focus:outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-100 transition-all placeholder:text-gray-300"
                />
                <button
                  type="submit"
                  disabled={analysisLoading || !jdPastedText.trim()}
                  className="btn-scale w-full h-12 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border-0 transition-colors"
                >
                  {analysisLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <Spinner />
                      {analysisPhase}
                    </span>
                  ) : 'Analizar posición y compatibilidad'}
                </button>
              </form>
            </div>

            {/* Results: 2-column layout */}
            {(jdSummary || matchResult) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                {/* Left: JD Summary */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-7 card-hover">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">Resumen de la oferta</h3>
                  <p className="text-xs text-gray-400 mb-4">Análisis automático de la JD</p>
                  {jdSummary ? (
                    <div className="jd-summary text-sm text-gray-700">{jdSummary}</div>
                  ) : (
                    <EmptyState icon="📋" text="No se pudo obtener el resumen." />
                  )}
                </div>

                {/* Right: Match result */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-7 card-hover">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">Compatibilidad</h3>
                  <p className="text-xs text-gray-400 mb-4">Match perfil vs. posición</p>

                  {matchResult ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`match-badge ${matchResult.approved ? 'match-badge--approved' : 'match-badge--rejected'}`}>
                          {matchResult.approved ? '✓' : '✗'} Score: {matchResult.score} / {matchResult.threshold}
                        </span>
                        <span className={`text-sm font-medium ${
                          (matchResult.seniority_fit || 'match') === 'match' ? 'text-green-600' : 'text-amber-600'
                        }`}>
                          Seniority: {(matchResult.seniority_fit || 'match') === 'match'
                            ? 'compatible'
                            : matchResult.seniority_fit === 'overqualified' ? 'sobrecalificado' : 'por debajo'}
                        </span>
                      </div>

                      <p className="text-sm text-gray-700">
                        <span className="font-semibold text-gray-900">Recomendación:</span> {matchResult.recommendation}
                      </p>

                      {matchResult.reasons_for?.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-green-700 mb-2">A favor</h4>
                          <ul className="space-y-1">
                            {matchResult.reasons_for.map((r, idx) => (
                              <li key={idx} className="text-sm text-green-700 flex items-start gap-2"><span className="mt-0.5">+</span>{r}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {matchResult.reasons_against?.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-red-700 mb-2">En contra</h4>
                          <ul className="space-y-1">
                            {matchResult.reasons_against.map((r, idx) => (
                              <li key={idx} className="text-sm text-red-700 flex items-start gap-2"><span className="mt-0.5">−</span>{r}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* CTA: go to step 3 */}
                      {matchResult.approved && (
                        <button
                          type="button"
                          onClick={() => setCurrentStep(3)}
                          className="btn-scale w-full h-11 mt-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 cursor-pointer border-0 transition-colors"
                        >
                          Generar CV adaptado →
                        </button>
                      )}

                      {!matchResult.approved && (
                        <div className="pt-4 border-t border-gray-100">
                          <p className="text-xs text-gray-400 mb-3">El score está por debajo del umbral, pero podés generar el CV igual.</p>
                          <div className="flex gap-3">
                            <button type="button" onClick={() => { setCanGenerateCv(true); setCurrentStep(3) }} className="btn-scale flex-1 h-11 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 cursor-pointer border-0 transition-colors">
                              Generar de todas formas →
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : !profile ? (
                    <EmptyState icon="👤" text="Cargá un perfil en el Paso 1 para analizar compatibilidad." />
                  ) : (
                    <EmptyState icon="📊" text="La compatibilidad aparecerá junto con el resumen." />
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ Step 3: CV adaptado — 2-col (preview left, controls right) ═══ */}
        {currentStep === 3 && (
          <div className="animate-fade-in">
            {!jdSummary && !canGenerateCv && (
              <div className="mb-6 px-5 py-4 rounded-xl bg-amber-50 text-amber-800 text-sm border border-amber-100 flex items-center gap-3">
                <span className="text-lg">⚠️</span>
                <span>Primero analizá una posición en el <button type="button" onClick={() => setCurrentStep(2)} className="font-semibold underline cursor-pointer bg-transparent border-0 text-amber-800 p-0">Paso 2</button> para poder generar el CV.</span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
              {/* Left: PDF Preview */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 card-hover" style={{ minHeight: '500px' }}>
                {pdfPreviewUrl ? (
                  <div className="animate-fade-in">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Vista previa del CV</h3>
                    <iframe
                      src={pdfPreviewUrl}
                      title="Vista previa del CV"
                      className="pdf-preview"
                    />
                  </div>
                ) : generateLoading ? (
                  <div className="flex flex-col items-center justify-center h-full py-20 text-blue-600 animate-pulse-soft">
                    <Spinner />
                    <p className="text-sm mt-3">Generando CV adaptado…</p>
                  </div>
                ) : (
                  <EmptyState icon="📄" text="La vista previa del PDF aparecerá acá después de generar el CV." />
                )}
              </div>

              {/* Right: Controls + Downloads */}
              <div className="space-y-5">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 card-hover">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Generar CV</h3>

                  <form onSubmit={handleGenerateCv} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Idioma del CV</label>
                      <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                        disabled={generateLoading}
                        aria-label="Idioma del CV"
                        className="w-full h-12 px-4 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-100 transition-all"
                      >
                        <option value="es">Español</option>
                        <option value="en">English</option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      disabled={generateLoading || !jdSummary || !canGenerateCv}
                      className="btn-scale w-full h-12 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer border-0 transition-colors"
                    >
                      {generateLoading ? (
                        <span className="flex items-center justify-center gap-2"><Spinner /> Generando…</span>
                      ) : 'Generar CV adaptado'}
                    </button>
                  </form>

                  {error && (
                    <div className="mt-4 px-4 py-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-100">{error}</div>
                  )}
                </div>

                {/* Download buttons */}
                {(pdfUrl || docxUrl) && (
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 card-hover animate-fade-in">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Descargar</h3>
                    <div className="space-y-3">
                      {pdfUrl && (
                        <a
                          href={pdfUrl}
                          download={pdfFilename}
                          className="btn-scale flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 no-underline transition-colors"
                        >
                          <span className="text-lg">📑</span>
                          <div>
                            <p className="font-semibold">Descargar PDF</p>
                            <p className="text-xs text-blue-200">Listo para enviar</p>
                          </div>
                        </a>
                      )}
                      {docxUrl && (
                        <a
                          href={docxUrl}
                          download={docxFilename}
                          className="btn-scale flex items-center gap-3 w-full px-4 py-3 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium bg-white hover:bg-gray-50 no-underline transition-colors"
                        >
                          <span className="text-lg">📄</span>
                          <div>
                            <p className="font-semibold">Descargar Word</p>
                            <p className="text-xs text-gray-400">Para editar</p>
                          </div>
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
