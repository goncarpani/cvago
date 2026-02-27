import { useState, useRef, useEffect } from 'react'

function ensure(obj, def = {}) {
  return obj != null ? obj : def
}
function ensureArray(arr) {
  return Array.isArray(arr) ? arr : []
}

const LEVEL_OPTIONS = [
  { value: '', label: '—' },
  { value: 'básico', label: 'Básico' },
  { value: 'intermedio', label: 'Intermedio' },
  { value: 'avanzado', label: 'Avanzado' },
]
const WORK_MODE_OPTIONS = [
  { value: '', label: '—' },
  { value: 'remoto', label: 'Remoto' },
  { value: 'híbrido', label: 'Híbrido' },
  { value: 'presencial', label: 'Presencial' },
]
const SENIORITY_OPTIONS = [
  { value: '', label: '—' },
  { value: 'mid', label: 'Mid' },
  { value: 'senior', label: 'Senior' },
  { value: 'staff', label: 'Staff' },
  { value: '_custom', label: 'Otro (escribir)' },
]
const MY_ROLE_OPTIONS = [
  { value: '', label: '—' },
  { value: 'owner', label: 'Owner' },
  { value: 'contributor', label: 'Contributor' },
  { value: 'support', label: 'Support' },
]
const DEPTH_OPTIONS = [
  { value: '', label: '—' },
  { value: 'architecture', label: 'Architecture' },
  { value: 'implementation', label: 'Implementation' },
  { value: 'basic', label: 'Basic' },
]

function SectionCard({ title, isEditing, onToggleEdit, children, readOnlyContent }) {
  return (
    <section className="result-section">
      <div className="result-section-header">
        <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">{title}</h4>
        <button
          type="button"
          className="btn-icon"
          onClick={onToggleEdit}
          title={isEditing ? 'Cerrar' : 'Editar'}
          aria-label={isEditing ? 'Cerrar' : 'Editar'}
        >
          {isEditing ? '✓' : '✎'}
        </button>
      </div>
      {isEditing ? children : readOnlyContent}
    </section>
  )
}

function parseTargetRoles(text) {
  return (text || '').split(/[\n,]/).map(s => s.trim()).filter(Boolean)
}

export default function ProfileResultView({ data, onChange }) {
  const [editingSection, setEditingSection] = useState(null)
  const [editingExperienceIndex, setEditingExperienceIndex] = useState(null)
  const [targetRolesDraft, setTargetRolesDraft] = useState('')
  const prevEditingSectionRef = useRef(null)

  const personal = ensure(data?.personal, { links: {} })
  const narrative = ensure(data?.narrative, {})
  const experience = ensureArray(data?.experience)
  const education = ensureArray(data?.education)
  const skills = ensure(data?.skills, { technical: [], soft: [] })
  const languages = ensureArray(data?.languages)
  const strategy = ensure(data?.strategy, {})

  const update = (path, value) => {
    onChange(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      const parts = path.split('.')
      let cur = next
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i]
        if (cur[p] == null) cur[p] = /^\d+$/.test(parts[i + 1]) ? [] : {}
        cur[p] = Array.isArray(cur[p]) ? [...cur[p]] : { ...cur[p] }
        cur = cur[p]
      }
      cur[parts[parts.length - 1]] = value
      return next
    })
  }

  const updateSkill = (idx, key, value) => {
    onChange(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      if (!next.skills) next.skills = { technical: [], soft: [] }
      next.skills.technical = [...(next.skills.technical || [])]
      next.skills.technical[idx] = { ...(next.skills.technical[idx] || {}), [key]: value }
      return next
    })
  }

  const presentationText = [narrative.headline, narrative.coreIdentity, narrative.careerGoal]
    .map(s => (s != null ? String(s).trim() : ''))
    .join('\n\n')
  const setPresentationText = (text) => {
    const parts = (text || '').split(/\n\n+/)
    onChange(prev => {
      const next = JSON.parse(JSON.stringify(prev))
      if (!next.narrative) next.narrative = {}
      next.narrative.headline = (parts[0] ?? '').trim()
      next.narrative.coreIdentity = (parts[1] ?? '').trim()
      next.narrative.careerGoal = (parts.slice(2).join('\n\n') ?? '').trim()
      return next
    })
  }

  const isCustomSeniority = strategy.seniority === '_custom'
  const seniorityDisplay = isCustomSeniority ? (strategy.seniorityCustom || '') : (strategy.seniority || '')
  const seniorityValue = strategy.seniority === '_custom' ? '_custom' : (strategy.seniority || '')

  // Al abrir la sección Estrategia, inicializar el draft de target roles desde el perfil
  useEffect(() => {
    if (editingSection === 'strategy' && prevEditingSectionRef.current !== 'strategy') {
      setTargetRolesDraft(ensureArray(strategy.targetRoles).join('\n'))
      prevEditingSectionRef.current = 'strategy'
    } else if (editingSection !== 'strategy') {
      prevEditingSectionRef.current = editingSection
    }
  }, [editingSection])

  const syncTargetRolesFromDraft = () => {
    const parsed = parseTargetRoles(targetRolesDraft)
    update('strategy.targetRoles', parsed)
  }

  const handleCloseStrategyEdit = () => {
    syncTargetRolesFromDraft()
    setEditingSection(null)
  }

  return (
    <div className="profile-result-view">
      <SectionCard
        title="Datos personales"
        isEditing={editingSection === 'personal'}
        onToggleEdit={() => setEditingSection(editingSection === 'personal' ? null : 'personal')}
        readOnlyContent={
          <div className="readonly-block">
            <p className="font-medium text-gray-900">{[personal.firstName, personal.lastName].filter(Boolean).join(' ')}</p>
            <p className="text-gray-500 text-sm mt-1">{[personal.email, personal.phone, personal.location].filter(Boolean).join(' · ')}</p>
            {[personal.links?.linkedin, personal.links?.github, personal.links?.portfolio].filter(Boolean).length > 0 && (
              <p className="text-gray-400 text-xs mt-1">{[personal.links?.linkedin, personal.links?.github, personal.links?.portfolio].filter(Boolean).join(' | ')}</p>
            )}
          </div>
        }
      >
        <div className="editor-grid">
          <label>Nombre <input value={personal.firstName ?? ''} onChange={e => update('personal.firstName', e.target.value)} /></label>
          <label>Apellido <input value={personal.lastName ?? ''} onChange={e => update('personal.lastName', e.target.value)} /></label>
          <label>Email <input type="email" value={personal.email ?? ''} onChange={e => update('personal.email', e.target.value)} /></label>
          <label>Teléfono <input value={personal.phone ?? ''} onChange={e => update('personal.phone', e.target.value)} /></label>
          <label>Ubicación <input value={personal.location ?? ''} onChange={e => update('personal.location', e.target.value)} /></label>
          <label>LinkedIn <input value={personal.links?.linkedin ?? ''} onChange={e => update('personal.links.linkedin', e.target.value)} /></label>
          <label>GitHub <input value={personal.links?.github ?? ''} onChange={e => update('personal.links.github', e.target.value)} /></label>
          <label>Portfolio <input value={personal.links?.portfolio ?? ''} onChange={e => update('personal.links.portfolio', e.target.value)} /></label>
        </div>
      </SectionCard>

      <SectionCard
        title="Presentación"
        isEditing={editingSection === 'narrative'}
        onToggleEdit={() => setEditingSection(editingSection === 'narrative' ? null : 'narrative')}
        readOnlyContent={
          <div className="readonly-block">
            <p className="pre-wrap text-sm text-gray-700">{presentationText || '—'}</p>
          </div>
        }
      >
        <label className="label-full">
          <textarea className="textarea-presentation" value={presentationText} onChange={e => setPresentationText(e.target.value)} />
        </label>
      </SectionCard>

      <section className="result-section">
        <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Experiencia</h4>
        {experience.length === 0 && (
          <div className="readonly-block"><p className="text-gray-400 text-sm">—</p></div>
        )}
        {experience.map((exp, idx) => {
          const imm = exp?.immutable ?? {}
          const isEditingRole = editingExperienceIndex === idx
          return (
            <div key={idx} className="experience-role-block">
              <div className="result-section-header">
                <h5 className="text-sm font-semibold text-gray-800">{imm.officialTitle || `Rol ${idx + 1}`}</h5>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => setEditingExperienceIndex(isEditingRole ? null : idx)}
                  title={isEditingRole ? 'Cerrar' : 'Editar este rol'}
                  aria-label={isEditingRole ? 'Cerrar' : 'Editar este rol'}
                >
                  {isEditingRole ? '✓' : '✎'}
                </button>
              </div>
              {!isEditingRole ? (
                <div className="readonly-block experience-readonly">
                  <p className="experience-meta">{imm.company}{[imm.start, imm.end].some(Boolean) ? ` · ${imm.start || '?'} – ${imm.end || '?'}` : ''}</p>
                  {(exp.raw != null && String(exp.raw).trim()) !== '' && (
                    <div className="mt-2">
                      <span className="experience-label">Texto original:</span>
                      <p className="pre-wrap text-sm text-gray-600 mt-1">{exp.raw}</p>
                    </div>
                  )}
                  {ensureArray(exp.facts).length > 0 && (
                    <div className="mt-3">
                      <span className="experience-label">Facts:</span>
                      <ul className="mt-1">{ensureArray(exp.facts).map((f, i) => (
                        <li key={i} className="text-sm text-gray-600">{f.what}{f.metric != null ? ` (${f.metric})` : ''}{f.scope ? ` · ${f.scope}` : ''}{f.myRole ? ` [${f.myRole}]` : ''}</li>
                      ))}</ul>
                    </div>
                  )}
                  {ensureArray(exp.capabilities).length > 0 && (
                    <div className="mt-3">
                      <span className="experience-label">Capabilities:</span>
                      <ul className="mt-1">{ensureArray(exp.capabilities).map((c, i) => (
                        <li key={i} className="text-sm text-gray-600"><strong className="text-gray-800">{c.name}</strong>{Array.isArray(c.evidence) && c.evidence.length ? ` — ${c.evidence.join('; ')}` : ''}</li>
                      ))}</ul>
                    </div>
                  )}
                  {ensureArray(exp.technologies).length > 0 && (
                    <div className="mt-3">
                      <span className="experience-label">Technologies:</span>
                      <div className="chips-wrap mt-1">
                        {ensureArray(exp.technologies).map((t, i) => (
                          <span key={i} className="chip">{typeof t === 'string' ? t : t?.name}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="experience-edit-single editor-card">
                  <label className="label-full experience-edit-raw-label">
                    <span className="experience-label">Texto original (editable)</span>
                    <textarea
                      className="textarea-raw-inline"
                      value={exp.raw ?? ''}
                      onChange={e => { onChange(prev => { const n = JSON.parse(JSON.stringify(prev)); n.experience[idx] = { ...n.experience[idx], raw: e.target.value }; return n }) }}
                      placeholder="Pegá o escribí el texto de este rol..."
                    />
                  </label>
                  <div className="editor-grid experience-meta-edit">
                    <label>Empresa <input value={imm.company ?? ''} onChange={e => { onChange(prev => { const n = JSON.parse(JSON.stringify(prev)); n.experience[idx] = n.experience[idx] || {}; n.experience[idx].immutable = { ...(n.experience[idx].immutable || {}), company: e.target.value }; return n }) }} /></label>
                    <label>Título <input value={imm.officialTitle ?? ''} onChange={e => { onChange(prev => { const n = JSON.parse(JSON.stringify(prev)); n.experience[idx].immutable = { ...(n.experience[idx].immutable || {}), officialTitle: e.target.value }; return n }) }} /></label>
                    <label>Inicio <input value={imm.start ?? ''} onChange={e => { onChange(prev => { const n = JSON.parse(JSON.stringify(prev)); n.experience[idx].immutable = { ...(n.experience[idx].immutable || {}), start: e.target.value }; return n }) }} placeholder="YYYY-MM" /></label>
                    <label>Fin <input value={imm.end ?? ''} onChange={e => { onChange(prev => { const n = JSON.parse(JSON.stringify(prev)); n.experience[idx].immutable = { ...(n.experience[idx].immutable || {}), end: e.target.value }; return n }) }} placeholder="present" /></label>
                  </div>
                  <div className="experience-edit-facts">
                    <span className="experience-label">Facts</span>
                    <div className="experience-edit-header experience-fact-row">
                      <span className="col-header fact-what">Qué lograste</span>
                      <span className="col-header fact-metric">Métrica</span>
                      <span className="col-header fact-scope">Alcance</span>
                      <span className="col-header fact-role">Rol</span>
                      <span className="col-header col-actions" />
                    </div>
                    {ensureArray(exp.facts).map((f, fi) => (
                      <div key={fi} className="experience-fact-row">
                        <input value={f.what ?? ''} onChange={e => { const v = e.target.value; onChange(prev => { const n = JSON.parse(JSON.stringify(prev)); n.experience[idx].facts = [...ensureArray(n.experience[idx].facts)]; n.experience[idx].facts[fi] = { ...(n.experience[idx].facts[fi] || {}), what: v }; return n }) }} placeholder="Qué lograste" className="fact-what" />
                        <input type="number" value={f.metric ?? ''} onChange={e => { const v = e.target.value; onChange(prev => { const n = JSON.parse(JSON.stringify(prev)); n.experience[idx].facts = [...ensureArray(n.experience[idx].facts)]; n.experience[idx].facts[fi] = { ...(n.experience[idx].facts[fi] || {}), metric: v === '' ? null : Number(v) || null }; return n }) }} placeholder="Métrica" className="fact-metric" />
                        <input value={f.scope ?? ''} onChange={e => { const v = e.target.value; onChange(prev => { const n = JSON.parse(JSON.stringify(prev)); n.experience[idx].facts = [...ensureArray(n.experience[idx].facts)]; n.experience[idx].facts[fi] = { ...(n.experience[idx].facts[fi] || {}), scope: v }; return n }) }} placeholder="Alcance" className="fact-scope" />
                        <select value={f.myRole ?? ''} onChange={e => { const v = e.target.value; onChange(prev => { const n = JSON.parse(JSON.stringify(prev)); n.experience[idx].facts = [...ensureArray(n.experience[idx].facts)]; n.experience[idx].facts[fi] = { ...(n.experience[idx].facts[fi] || {}), myRole: v || undefined }; return n }) }} className="fact-role">
                          {MY_ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <button type="button" className="btn-icon btn-remove" onClick={() => onChange(prev => { const n = JSON.parse(JSON.stringify(prev)); n.experience[idx].facts = ensureArray(n.experience[idx].facts).filter((_, i) => i !== fi); return n })} title="Quitar">×</button>
                      </div>
                    ))}
                    <button type="button" className="button-add-item" onClick={() => onChange(prev => { const n = JSON.parse(JSON.stringify(prev)); n.experience[idx] = n.experience[idx] || {}; n.experience[idx].facts = [...ensureArray(n.experience[idx].facts), { what: '', metric: null, scope: '', myRole: '' }]; return n })}>+ Agregar fact</button>
                  </div>
                  <div className="experience-edit-capabilities">
                    <span className="experience-label">Capabilities</span>
                    <div className="experience-edit-header experience-capability-row">
                      <span className="col-header cap-name">Nombre</span>
                      <span className="col-header cap-evidence">Evidence (separado por coma)</span>
                      <span className="col-header col-actions" />
                    </div>
                    {ensureArray(exp.capabilities).map((c, ci) => (
                      <div key={ci} className="experience-capability-row">
                        <input value={c.name ?? ''} onChange={e => { const v = e.target.value; onChange(prev => { const n = JSON.parse(JSON.stringify(prev)); n.experience[idx].capabilities = [...ensureArray(n.experience[idx].capabilities)]; n.experience[idx].capabilities[ci] = { ...(n.experience[idx].capabilities[ci] || {}), name: v }; return n }) }} placeholder="Nombre" className="cap-name" />
                        <input value={Array.isArray(c.evidence) ? c.evidence.join(', ') : ''} onChange={e => { const v = e.target.value.split(',').map(s => s.trim()).filter(Boolean); onChange(prev => { const n = JSON.parse(JSON.stringify(prev)); n.experience[idx].capabilities = [...ensureArray(n.experience[idx].capabilities)]; n.experience[idx].capabilities[ci] = { ...(n.experience[idx].capabilities[ci] || {}), evidence: v }; return n }) }} placeholder="Evidence (separado por coma)" className="cap-evidence" />
                        <button type="button" className="btn-icon btn-remove" onClick={() => onChange(prev => { const n = JSON.parse(JSON.stringify(prev)); n.experience[idx].capabilities = ensureArray(n.experience[idx].capabilities).filter((_, i) => i !== ci); return n })} title="Quitar">×</button>
                      </div>
                    ))}
                    <button type="button" className="button-add-item" onClick={() => onChange(prev => { const n = JSON.parse(JSON.stringify(prev)); n.experience[idx] = n.experience[idx] || {}; n.experience[idx].capabilities = [...ensureArray(n.experience[idx].capabilities), { name: '', evidence: [] }]; return n })}>+ Agregar capability</button>
                  </div>
                  <div className="experience-edit-technologies">
                    <span className="experience-label">Technologies</span>
                    <div className="experience-edit-header experience-tech-row">
                      <span className="col-header tech-name">Nombre</span>
                      <span className="col-header tech-years">Años</span>
                      <span className="col-header tech-production">En producción</span>
                      <span className="col-header tech-depth">Depth</span>
                      <span className="col-header tech-contexts">Contexts (uno por línea)</span>
                      <span className="col-header col-actions" />
                    </div>
                    {ensureArray(exp.technologies).map((t, ti) => {
                      const tech = typeof t === 'string' ? { name: t, yearsInThisRole: 0, usedInProduction: false, depth: '', contexts: [] } : (t || {})
                      return (
                        <div key={ti} className="experience-tech-row">
                          <input value={tech.name ?? ''} onChange={e => { const v = e.target.value; onChange(prev => { const n = JSON.parse(JSON.stringify(prev)); n.experience[idx].technologies = [...ensureArray(n.experience[idx].technologies)]; n.experience[idx].technologies[ti] = { ...(typeof n.experience[idx].technologies[ti] === 'object' && n.experience[idx].technologies[ti] != null ? n.experience[idx].technologies[ti] : { name: '' }), name: v }; return n }) }} placeholder="Nombre" className="tech-name" />
                          <input type="number" min="0" value={tech.yearsInThisRole ?? ''} onChange={e => { const v = e.target.value; onChange(prev => { const n = JSON.parse(JSON.stringify(prev)); n.experience[idx].technologies = [...ensureArray(n.experience[idx].technologies)]; n.experience[idx].technologies[ti] = { ...(typeof n.experience[idx].technologies[ti] === 'object' && n.experience[idx].technologies[ti] != null ? n.experience[idx].technologies[ti] : {}), yearsInThisRole: v === '' ? 0 : Number(v) || 0 }; return n }) }} placeholder="Años" className="tech-years" />
                          <select value={tech.usedInProduction === true ? 'true' : (tech.usedInProduction === false ? 'false' : '')} onChange={e => { const v = e.target.value; onChange(prev => { const n = JSON.parse(JSON.stringify(prev)); n.experience[idx].technologies = [...ensureArray(n.experience[idx].technologies)]; n.experience[idx].technologies[ti] = { ...(typeof n.experience[idx].technologies[ti] === 'object' && n.experience[idx].technologies[ti] != null ? n.experience[idx].technologies[ti] : {}), usedInProduction: v === 'true' }; return n }) }} className="tech-production">
                            <option value="">—</option>
                            <option value="true">Sí</option>
                            <option value="false">No</option>
                          </select>
                          <select value={tech.depth ?? ''} onChange={e => { const v = e.target.value; onChange(prev => { const n = JSON.parse(JSON.stringify(prev)); n.experience[idx].technologies = [...ensureArray(n.experience[idx].technologies)]; n.experience[idx].technologies[ti] = { ...(typeof n.experience[idx].technologies[ti] === 'object' && n.experience[idx].technologies[ti] != null ? n.experience[idx].technologies[ti] : {}), depth: v || undefined }; return n }) }} className="tech-depth">
                            {DEPTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          <textarea value={Array.isArray(tech.contexts) ? tech.contexts.join('\n') : ''} onChange={e => { const v = e.target.value.split(/\n/).map(s => s.trim()).filter(Boolean); onChange(prev => { const n = JSON.parse(JSON.stringify(prev)); n.experience[idx].technologies = [...ensureArray(n.experience[idx].technologies)]; n.experience[idx].technologies[ti] = { ...(typeof n.experience[idx].technologies[ti] === 'object' && n.experience[idx].technologies[ti] != null ? n.experience[idx].technologies[ti] : {}), contexts: v }; return n }) }} placeholder="Uno por línea" className="tech-contexts" rows={2} />
                          <button type="button" className="btn-icon btn-remove" onClick={() => onChange(prev => { const n = JSON.parse(JSON.stringify(prev)); n.experience[idx].technologies = ensureArray(n.experience[idx].technologies).filter((_, i) => i !== ti); return n })} title="Quitar">×</button>
                        </div>
                      )
                    })}
                    <button type="button" className="button-add-item" onClick={() => onChange(prev => { const n = JSON.parse(JSON.stringify(prev)); n.experience[idx] = n.experience[idx] || {}; n.experience[idx].technologies = [...ensureArray(n.experience[idx].technologies), { name: '', yearsInThisRole: 0, usedInProduction: false, depth: '', contexts: [] }]; return n })}>+ Agregar technology</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </section>

      <SectionCard
        title="Educación"
        isEditing={editingSection === 'education'}
        onToggleEdit={() => setEditingSection(editingSection === 'education' ? null : 'education')}
        readOnlyContent={
          <div className="readonly-block">
            {education.map((ed, i) => (
              <p key={i} className="text-sm text-gray-700">{ed.degree} — {ed.institution} ({ed.year})</p>
            ))}
            {education.length === 0 && <p className="text-sm text-gray-400">—</p>}
          </div>
        }
      >
        {education.map((ed, idx) => (
          <div key={idx} className="editor-card">
            <div className="editor-grid">
              <label>Título <input value={ed.degree ?? ''} onChange={e => { onChange(prev => { const n = JSON.parse(JSON.stringify(prev)); n.education[idx] = { ...(n.education[idx] || {}), degree: e.target.value }; return n }) }} /></label>
              <label>Institución <input value={ed.institution ?? ''} onChange={e => { onChange(prev => { const n = JSON.parse(JSON.stringify(prev)); n.education[idx] = { ...(n.education[idx] || {}), institution: e.target.value }; return n }) }} /></label>
              <label>Año <input value={ed.year ?? ''} onChange={e => { onChange(prev => { const n = JSON.parse(JSON.stringify(prev)); n.education[idx] = { ...(n.education[idx] || {}), year: e.target.value }; return n }) }} /></label>
              <label>Notas <input value={ed.notes ?? ''} onChange={e => { onChange(prev => { const n = JSON.parse(JSON.stringify(prev)); n.education[idx] = { ...(n.education[idx] || {}), notes: e.target.value }; return n }) }} className="full-width" /></label>
            </div>
          </div>
        ))}
      </SectionCard>

      <SectionCard
        title="Skills técnicas"
        isEditing={editingSection === 'skills'}
        onToggleEdit={() => setEditingSection(editingSection === 'skills' ? null : 'skills')}
        readOnlyContent={
          <div className="readonly-block">
            <div className="chips-wrap">
              {ensureArray(skills.technical).map((s, i) => (
                <span key={i} className="chip">{s.name}{s.level ? ` (${s.level})` : ''}</span>
              ))}
            </div>
            {ensureArray(skills.technical).length === 0 && <p className="text-sm text-gray-400">—</p>}
          </div>
        }
      >
        <div className="mt-2">
          <p className="text-xs text-gray-400 mb-3">Nivel, usado en producción, años totales, último uso (ej. 2024)</p>
          {ensureArray(skills.technical).map((s, idx) => (
            <div key={idx} className="skill-row">
              <input value={s.name ?? ''} onChange={e => updateSkill(idx, 'name', e.target.value)} placeholder="Skill" className="skill-name" />
              <select value={s.level ?? ''} onChange={e => updateSkill(idx, 'level', e.target.value)} className="skill-level">
                {LEVEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select value={s.usedInProduction === true ? 'true' : (s.usedInProduction === false ? 'false' : '')} onChange={e => updateSkill(idx, 'usedInProduction', e.target.value === 'true')} className="skill-production">
                <option value="">—</option>
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
              <input type="number" min="0" value={s.yearsTotal ?? ''} onChange={e => updateSkill(idx, 'yearsTotal', e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0)} placeholder="Años" className="skill-years" />
              <input value={s.lastUsed ?? ''} onChange={e => updateSkill(idx, 'lastUsed', e.target.value)} placeholder="Último año" className="skill-last" />
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Skills blandas"
        isEditing={editingSection === 'soft'}
        onToggleEdit={() => setEditingSection(editingSection === 'soft' ? null : 'soft')}
        readOnlyContent={
          <div className="readonly-block">
            <div className="chips-wrap">
              {ensureArray(skills.soft).map((s, i) => (
                <span key={i} className="chip">{s}</span>
              ))}
            </div>
            {ensureArray(skills.soft).length === 0 && <p className="text-sm text-gray-400">—</p>}
          </div>
        }
      >
        <p className="text-xs text-gray-400 mb-2">Una por línea o separadas por coma.</p>
        <label className="label-full">
          <textarea
            className="textarea-soft"
            value={Array.isArray(skills.soft) ? skills.soft.join('\n') : ''}
            onChange={e => update('skills.soft', e.target.value.split(/[\n,]/).map(s => s.trim()).filter(Boolean))}
            placeholder="Team building, Mentoring, ..."
            rows={4}
          />
        </label>
      </SectionCard>

      <SectionCard
        title="Idiomas"
        isEditing={editingSection === 'languages'}
        onToggleEdit={() => setEditingSection(editingSection === 'languages' ? null : 'languages')}
        readOnlyContent={
          <div className="readonly-block">
            <div className="chips-wrap">
              {languages.map((l, i) => <span key={i} className="chip">{l.language} ({l.level})</span>)}
            </div>
            {languages.length === 0 && <p className="text-sm text-gray-400">—</p>}
          </div>
        }
      >
        {languages.map((lang, idx) => (
          <div key={idx} className="editor-row">
            <input value={lang.language ?? ''} onChange={e => { onChange(prev => { const n = JSON.parse(JSON.stringify(prev)); n.languages[idx] = { ...(n.languages[idx] || {}), language: e.target.value }; return n }) }} placeholder="Idioma" />
            <input value={lang.level ?? ''} onChange={e => { onChange(prev => { const n = JSON.parse(JSON.stringify(prev)); n.languages[idx] = { ...(n.languages[idx] || {}), level: e.target.value }; return n }) }} placeholder="Nivel" style={{ width: '140px' }} />
          </div>
        ))}
      </SectionCard>

      <SectionCard
        title="Estrategia"
        isEditing={editingSection === 'strategy'}
        onToggleEdit={() => (editingSection === 'strategy' ? handleCloseStrategyEdit() : setEditingSection('strategy'))}
        readOnlyContent={
          <div className="readonly-block space-y-2">
            <div>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Target roles</span>
              <div className="chips-wrap mt-1">
                {ensureArray(strategy.targetRoles).length > 0 ? ensureArray(strategy.targetRoles).map((r, i) => <span key={i} className="chip">{r}</span>) : <span className="text-sm text-gray-400">—</span>}
              </div>
            </div>
            <p className="text-sm text-gray-700"><span className="font-medium text-gray-500">Work mode:</span> {strategy.workMode || '—'}</p>
            <p className="text-sm text-gray-700"><span className="font-medium text-gray-500">Seniority:</span> {seniorityDisplay || '—'}</p>
          </div>
        }
      >
        <div className="editor-grid">
          <label className="full-width">Target roles (uno por línea o separados por coma)
            <textarea
              value={targetRolesDraft}
              onChange={e => setTargetRolesDraft(e.target.value)}
              onBlur={syncTargetRolesFromDraft}
              className="textarea-soft"
              rows={4}
              placeholder="Data Engineer&#10;Tech Lead&#10;Business Analyst"
            />
          </label>
          <label>Work mode (qué buscás) <select value={strategy.workMode ?? ''} onChange={e => update('strategy.workMode', e.target.value)}>
            {WORK_MODE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select></label>
          <label>Seniority <select value={seniorityValue} onChange={e => { const v = e.target.value; update('strategy.seniority', v === '_custom' ? '_custom' : v); if (v !== '_custom') update('strategy.seniorityCustom', ''); }}>
            {SENIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select></label>
          {seniorityValue === '_custom' && (
            <label>Seniority (valor a mano) <input value={strategy.seniorityCustom ?? ''} onChange={e => update('strategy.seniorityCustom', e.target.value)} placeholder="Ej. lead, principal" /></label>
          )}
        </div>
      </SectionCard>

      <section className="result-section">
        <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-2">Constraints</h4>
        <div className="readonly-block">
          <p className="text-xs text-gray-400"><span className="font-medium text-gray-500">cannotModify:</span> dates, companies, officialTitle, technologies, educationDegrees</p>
          <p className="text-xs text-gray-400 mt-1"><span className="font-medium text-gray-500">canReframe:</span> achievements, summary, bulletOrdering, skillHighlighting, capabilityEmphasis, headline</p>
        </div>
      </section>
    </div>
  )
}
