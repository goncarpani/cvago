import { useState } from 'react'

function ensureArray(arr) {
  return Array.isArray(arr) ? arr : []
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  )
}

function ChevronIcon({ open }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function Section({ title, defaultOpen = true, count, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t border-gray-100 first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-3 text-left cursor-pointer bg-transparent border-0 px-0"
      >
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          {title}
          {count != null && <span className="ml-1.5 text-gray-300 font-normal">({count})</span>}
        </span>
        <ChevronIcon open={open} />
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  )
}

export default function ProfileSummary({ profile }) {
  const [showJson, setShowJson] = useState(false)

  if (!profile) return null

  const personal = profile.personal || {}
  const narrative = profile.narrative || {}
  const experience = ensureArray(profile.experience)
  const skills = profile.skills || {}
  const techSkills = ensureArray(skills.technical)
  const softSkills = ensureArray(skills.soft)
  const languages = ensureArray(profile.languages)
  const education = ensureArray(profile.education)
  const strategy = profile.strategy || {}
  const targetRoles = ensureArray(strategy.targetRoles)

  const links = personal.links || {}
  const activeLinks = Object.entries(links).filter(([, v]) => v && v.trim())

  const fullName = [personal.firstName, personal.lastName].filter(Boolean).join(' ')

  const totalYears = experience.length > 0
    ? (() => {
        const starts = experience.map(e => e?.immutable?.start).filter(Boolean).sort()
        if (starts.length === 0) return null
        const earliest = parseInt(starts[0], 10)
        if (isNaN(earliest)) return null
        return new Date().getFullYear() - earliest
      })()
    : null

  return (
    <div className="animate-fade-in">
      {/* View toggle */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-base font-semibold text-gray-900">Perfil guardado</h3>
        <button
          type="button"
          onClick={() => setShowJson(j => !j)}
          className="text-xs text-gray-400 hover:text-blue-600 cursor-pointer bg-transparent border-0 transition-colors flex items-center gap-1"
        >
          {showJson ? 'Ver resumen' : 'Ver JSON'}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 18l6-6-6-6" /><path d="M8 6l-6 6 6 6" />
          </svg>
        </button>
      </div>

      {showJson ? (
        <pre className="profile-json-viewer text-xs max-h-[500px]">{JSON.stringify(profile, null, 2)}</pre>
      ) : (
        <div>
          {/* Identity header */}
          <div className="pb-5 border-b border-gray-100 mb-5">
            <div className="flex items-start gap-4 mb-3">
              <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-lg font-bold shrink-0">
                {(personal.firstName?.[0] || '?').toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-lg font-semibold text-gray-900">{fullName || 'Sin nombre'}</h4>
                <p className="text-sm text-gray-500">{personal.location || ''}</p>
              </div>
              {/* Contact — top right */}
              <div className="hidden sm:flex flex-col items-end gap-0.5 text-xs text-gray-400 shrink-0">
                {personal.email && <span>{personal.email}</span>}
                {personal.phone && <span>{personal.phone}</span>}
              </div>
            </div>

            {narrative.headline && (
              <p className="text-sm text-gray-600 leading-relaxed">{narrative.headline}</p>
            )}
            {narrative.coreIdentity && (
              <p className="text-sm text-gray-500 leading-relaxed mt-1">{narrative.coreIdentity}</p>
            )}

            {/* Quick stats + links row */}
            <div className="flex flex-wrap items-center gap-2 mt-4">
              {totalYears != null && (
                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-gray-50 text-gray-600 font-medium">
                  {totalYears}+ años exp.
                </span>
              )}
              {strategy.seniority && (
                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-medium capitalize">
                  {strategy.seniority}
                </span>
              )}
              {strategy.workMode && (
                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 font-medium capitalize">
                  {strategy.workMode}
                </span>
              )}
              {languages.length > 0 && (
                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-gray-50 text-gray-600 font-medium">
                  {languages.map(l => l.language).join(', ')}
                </span>
              )}
              {activeLinks.length > 0 && (
                <>
                  <span className="text-gray-200 mx-1">|</span>
                  {activeLinks.map(([key, url]) => (
                    <a
                      key={key}
                      href={url.startsWith('http') ? url : `https://${url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 no-underline transition-colors"
                    >
                      <LinkIcon />
                      {key}
                    </a>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Multi-column content grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Column 1: Experience */}
            <div className="md:col-span-1">
              <Section title="Experiencia" defaultOpen={true} count={experience.length}>
                <div className="space-y-3">
                  {experience.map((exp, i) => {
                    const imm = exp?.immutable || {}
                    return (
                      <div key={i} className="flex gap-3">
                        <div className="flex flex-col items-center pt-1">
                          <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                          {i < experience.length - 1 && <div className="w-px flex-1 bg-gray-100 mt-1" />}
                        </div>
                        <div className="min-w-0 pb-1">
                          <p className="text-sm font-medium text-gray-800">{imm.officialTitle || 'Rol'}</p>
                          <p className="text-xs text-gray-400">
                            {imm.company}
                            {imm.start && <span> · {imm.start} – {imm.end || '?'}</span>}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Section>

              {education.length > 0 && (
                <Section title="Educación" defaultOpen={true} count={education.length}>
                  <div className="space-y-2">
                    {education.map((ed, i) => (
                      <div key={i}>
                        <p className="text-sm font-medium text-gray-700">{ed.degree}</p>
                        <p className="text-xs text-gray-400">{ed.institution}{ed.year ? ` · ${ed.year}` : ''}</p>
                      </div>
                    ))}
                  </div>
                </Section>
              )}
            </div>

            {/* Column 2: Skills */}
            <div className="md:col-span-1">
              {techSkills.length > 0 && (
                <Section title="Skills técnicas" defaultOpen={true} count={techSkills.length}>
                  <div className="flex flex-wrap gap-1.5">
                    {techSkills.map((s, i) => (
                      <span
                        key={i}
                        className={`text-xs px-2 py-0.5 rounded font-medium ${
                          s.level === 'avanzado'
                            ? 'bg-blue-50 text-blue-700'
                            : s.level === 'intermedio'
                              ? 'bg-sky-50 text-sky-600'
                              : 'bg-gray-50 text-gray-500'
                        }`}
                      >
                        {s.name}
                      </span>
                    ))}
                  </div>
                </Section>
              )}

              {softSkills.length > 0 && (
                <Section title="Skills blandas" defaultOpen={true} count={softSkills.length}>
                  <div className="flex flex-wrap gap-1.5">
                    {softSkills.map((s, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-medium">{s}</span>
                    ))}
                  </div>
                </Section>
              )}
            </div>

            {/* Column 3: Strategy */}
            <div className="md:col-span-1">
              {targetRoles.length > 0 && (
                <Section title="Buscando" defaultOpen={true} count={targetRoles.length}>
                  <div className="flex flex-wrap gap-1.5">
                    {targetRoles.map((r, i) => (
                      <span key={i} className="text-xs px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-medium">{r}</span>
                    ))}
                  </div>
                </Section>
              )}

              {ensureArray(strategy.industries).length > 0 && (
                <Section title="Industrias" defaultOpen={true} count={ensureArray(strategy.industries).length}>
                  <div className="flex flex-wrap gap-1.5">
                    {ensureArray(strategy.industries).map((ind, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded bg-gray-50 text-gray-600 font-medium">{ind}</span>
                    ))}
                  </div>
                </Section>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
