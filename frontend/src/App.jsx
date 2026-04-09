import { useEffect, useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

//const API = 'http://127.0.0.1:8000';
const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';


const api = axios.create({ baseURL: API });
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

const S = {
  page:    { minHeight: '100vh', backgroundColor: '#f0f4f8', fontFamily: 'Arial, sans-serif', direction: 'rtl' },
  header:  { backgroundColor: '#1e3a5f', color: 'white', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  main:    { maxWidth: 1100, margin: '0 auto', padding: '24px 16px' },
  card:    { background: 'white', borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,.08)', padding: 24, marginBottom: 24},
  tabs:    { display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' },
  tab:     (active) => ({ padding: '10px 20px', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: active ? 700 : 400, backgroundColor: active ? '#1e3a5f' : '#e2e8f0', color: active ? 'white' : '#333' }),
  btn:     (color='#1e3a5f') => ({ padding: '9px 18px', backgroundColor: color, color: 'white', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 600, fontSize: 14, transition: 'all 0.2s ease'}),
  input:   { width: '100%', padding: '9px 12px', border: '1px solid #ccc', borderRadius: 7, fontSize: 14, marginBottom: 10, boxSizing: 'border-box' },
  badge:   (color) => ({ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, backgroundColor: color, color: 'white' }),
  table:   { width: '100%', borderCollapse: 'collapse' },
  th:      { background: '#f7fafc', padding: '10px 14px', textAlign: 'right', fontWeight: 600, borderBottom: '2px solid #e2e8f0', fontSize: 14 },
  td:      { padding: '10px 14px', borderBottom: '1px solid #f0f0f0', fontSize: 14 },
  label:   { display: 'block', marginBottom: 4, fontWeight: 600, fontSize: 14 },
  msg:     (ok) => ({ padding: '10px 14px', borderRadius: 7, backgroundColor: ok ? '#d4edda' : '#f8d7da', color: ok ? '#155724' : '#721c24', marginTop: 10 }),
};

const statusColor = { open: '#3498db', in_progress: '#f39c12', done: '#27ae60' };
const statusLabel = { open: 'פתוחה', in_progress: 'בביצוע', done: 'הושלמה' };


//  LOGIN PAGE

function LoginPage({ onLogin }) {
  const [personalId, setPersonalId] = useState('');
  const [pass, setPass]             = useState('');
  const [error, setError]           = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await axios.post(`${API}/login`, { personal_id: personalId, password: pass });
      localStorage.setItem('token', res.data.access_token);
      onLogin(res.data);
    } catch {
      setError('מספר אישי או סיסמה שגויים');
    }
  };

  return (
    <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ ...S.card, width: 380 }}>
        <h2 style={{ textAlign: 'center', marginBottom: 24, color: '#1e3a5f' }}>כניסה למערכת</h2>
        <form onSubmit={handleSubmit}>
          <label style={S.label}>מספר אישי</label>
          <input style={S.input} type="text" value={personalId} onChange={e => setPersonalId(e.target.value)} required placeholder="הכנס מספר אישי" />
          <label style={S.label}>סיסמה</label>
          <input style={S.input} type="password" value={pass} onChange={e => setPass(e.target.value)} required placeholder="••••••••" />
          <button type="submit" style={{ ...S.btn(), width: '100%', padding: 12, fontSize: 16 }}>כניסה</button>
        </form>
        {error && <div style={S.msg(false)}>{error}</div>}
      </div>
    </div>
  );
}


//  MANAGER — ניהול עובדים

function ManageEmployees({ certs }) {
  const [employees, setEmployees] = useState([]);
  const [form, setForm]           = useState({ full_name: '', personal_id: '', password: '', role: 'employee' });
  const [msg, setMsg]             = useState(null);
  const [certMap, setCertMap]     = useState({});

  const load = async () => {
    const res = await api.get('/employees');
    setEmployees(res.data);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await api.post('/employees', form);
      setMsg({ ok: true, text: 'עובד נוסף בהצלחה!' });
      setForm({ full_name: '', personal_id: '', password: '', role: 'employee' });
      load();
    } catch {
      setMsg({ ok: false, text: 'שגיאה — מספר אישי כבר קיים' });
    }
  };

  const handleAddCert = async (empId) => {
    const certId = certMap[empId];
    if (!certId) return;
    try {
      await api.post(`/employees/${empId}/certifications`, { certification_id: parseInt(certId) });
      setMsg({ ok: true, text: 'הסמכה נוספה!' });
      load();
    } catch {
      setMsg({ ok: false, text: 'שגיאה בהוספת הסמכה' });
    }
  };

  const handleDelete = async (empId, empName) => {
    if (!window.confirm(`האם למחוק את ${empName} לצמיתות?`)) return;
    try {
      await api.delete(`/employees/${empId}`);
      setMsg({ ok: true, text: 'העובד הוסר בהצלחה' });
      load();
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.detail || 'שגיאה במחיקת העובד' });
    }
  };

  return (
    <div>
      <div style={S.card}>
        <h3>הוספת עובד חדש</h3>
        <form onSubmit={handleAdd}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={S.label}>שם מלא</label>
              <input style={S.input} value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} required placeholder="ישראל ישראלי" />
            </div>
            <div>
              <label style={S.label}>מספר אישי</label>
              <input style={S.input} value={form.personal_id} onChange={e => setForm({...form, personal_id: e.target.value})} required placeholder="לדוגמה: 00123" />
            </div>
            <div>
              <label style={S.label}>סיסמה</label>
              <input style={S.input} value={form.password} onChange={e => setForm({...form, password: e.target.value})} required placeholder="••••••••" />
            </div>
            <div>
              <label style={S.label}>תפקיד</label>
              <select style={S.input} value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
                <option value="employee">עובד</option>
                <option value="manager">מנהל</option>
              </select>
            </div>
          </div>
          <button type="submit" style={S.btn('#27ae60')}>➕ הוסף עובד</button>
        </form>
        {msg && <div style={S.msg(msg.ok)}>{msg.text}</div>}
      </div>

      <div style={S.card}>
        <h3>רשימת עובדים ({employees.length})</h3>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>שם</th>
              <th style={S.th}>מספר אישי</th>
              <th style={S.th}>תפקיד</th>
              <th style={S.th}>הסמכות</th>
              <th style={S.th}>הוסף הסמכה</th>
              <th style={S.th}>הסר</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => (
              <tr key={emp.id}>
                <td style={S.td}>{emp.full_name}</td>
                <td style={S.td}>{emp.personal_id}</td>
                <td style={S.td}>{emp.role === 'manager' ? '👑\u00A0מנהל' : '👷\u00A0עובד'}</td>
                <td style={S.td}>{emp.certifications || '—'}</td>
                <td style={S.td}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select
                      style={{ ...S.input, marginBottom: 0, width: 160 }}
                      value={certMap[emp.id] || ''}
                      onChange={e => setCertMap({...certMap, [emp.id]: e.target.value})}
                    >
                      <option value="">בחר הסמכה</option>
                      {certs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button style={S.btn('#3498db')} onClick={() => handleAddCert(emp.id)}>הוסף</button>
                  </div>
                </td>
                <td style={S.td}>
                  <button
                    style={{ ...S.btn('#e53e3e'), padding: '7px 12px', fontSize: 13 }}
                    onClick={() => handleDelete(emp.id, emp.full_name)}
                    title="הסר עובד">
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


//  שיוך עובדים למשימות + הסרת שיוך

function AssignedEmployees({ taskId, assigned, onRemove }) {
  const handleRemove = async (empId) => {
    try {
      await api.delete(`/assignments/${taskId}/${empId}`);
      onRemove(); // מרענן את כל הנתונים מלמעלה
    } catch {
      // שגיאה שקטה
    }
  };

  if (!assigned || assigned.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
      {assigned.map(emp => (
        <span key={emp.id} style={{
          display: 'flex', alignItems: 'center', gap: 5,
          backgroundColor: '#e8f4fd', border: '1px solid #bee3f8',
          borderRadius: 20, padding: '4px 10px', fontSize: 13
        }}>
          {emp.role === 'manager' ? '👑' : '👷'} {emp.full_name}
          <button
            onClick={() => handleRemove(emp.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer',
              color: '#e53e3e', fontWeight: 700, fontSize: 16, padding: '0 2px', lineHeight: 1 }}>
            ×
          </button>
        </span>
      ))}
    </div>
  );
}


//   ניהול משימות (יצירה, מחיקה, שינוי סטטוס, שיוך עובדים, המלצת AI)

function ManageTasks({ certs }) {
  const [tasks, setTasks]                     = useState([]);
  const [assignedMap, setAssignedMap]         = useState({}); 
  const [form, setForm]                       = useState({ description: '', workers_needed: 1, required_certification_ids: [] });
  const [msg, setMsg]                         = useState(null);
  const [aiResult, setAiResult]               = useState({});
  const [aiLoading, setAiLoading]             = useState({});
  const [assignMap, setAssignMap]             = useState({});
  const [eligibleMap, setEligibleMap]         = useState({});
  const [eligibleLoading, setEligibleLoading] = useState({});

  const load = async () => {
    const t = await api.get('/tasks');
    setTasks(t.data);
    const entries = await Promise.all(
      t.data.map(task =>
        api.get(`/tasks/${task.id}/assignments`)
          .then(r => [task.id, r.data])
          .catch(() => [task.id, []])
      )
    );
    setAssignedMap(Object.fromEntries(entries));
  };

  useEffect(() => { load(); }, []);

  const loadEligible = async (taskId) => {
    if (eligibleMap[taskId]) return;
    setEligibleLoading(prev => ({...prev, [taskId]: true}));
    try {
      const res = await api.get(`/tasks/${taskId}/eligible-employees`);
      setEligibleMap(prev => ({...prev, [taskId]: res.data}));
    } catch {
      setEligibleMap(prev => ({...prev, [taskId]: []}));
    }
    setEligibleLoading(prev => ({...prev, [taskId]: false}));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/tasks', {
        ...form,
        required_certification_ids: form.required_certification_ids.map(Number)
      });
      setMsg({ ok: true, text: 'משימה נוצרה בהצלחה!' });
      setForm({ description: '', workers_needed: 1, required_certification_ids: [] });
      load();
    } catch {
      setMsg({ ok: false, text: 'שגיאה ביצירת משימה' });
    }
  };

  const handleAssign = async (taskId) => {
    const empId = assignMap[taskId];
    if (!empId) return;
    try {
      await api.post('/assignments', { task_id: taskId, employee_id: parseInt(empId) });
      setMsg({ ok: true, text: 'עובד שויך בהצלחה!' });
      setEligibleMap(prev => { const n = {...prev}; delete n[taskId]; return n; });
      setAssignMap(prev => { const n = {...prev}; delete n[taskId]; return n; });
      load();
    } catch {
      setMsg({ ok: false, text: 'שגיאה בשיוך' });
    }
  };

  const handleDelete = async (taskId) => {
    if (!window.confirm('האם למחוק את המשימה לצמיתות?')) return;
    try {
      await api.delete(`/tasks/${taskId}`);
      load();
    } catch {
      setMsg({ ok: false, text: 'שגיאה במחיקת המשימה' });
    }
  };

  const handleStatusChange = async (taskId, status) => {
    await api.patch(`/tasks/${taskId}/status`, { status });
    load();
  };

  const handleAI = async (taskId) => {
    setAiLoading(prev => ({...prev, [taskId]: true}));
    try {
      const res = await api.get(`/tasks/${taskId}/recommend`);
      setAiResult(prev => ({...prev, [taskId]: res.data.recommendation}));
    } catch {
      setAiResult(prev => ({...prev, [taskId]: 'שגיאה בקבלת המלצה מה-AI'}));
    }
    setAiLoading(prev => ({...prev, [taskId]: false}));
  };

  const handleCertToggle = (certId) => {
    const ids = form.required_certification_ids;
    setForm({
      ...form,
      required_certification_ids: ids.includes(certId)
        ? ids.filter(id => id !== certId)
        : [...ids, certId]
    });
  };

  return (
    <div>
      <div style={S.card}>
        <h3>יצירת משימה חדשה</h3>
        <form onSubmit={handleCreate}>
          <label style={S.label}>תיאור המשימה</label>
          <textarea
            style={{ ...S.input, height: 70, resize: 'vertical' }}
            value={form.description}
            onChange={e => setForm({...form, description: e.target.value})}
            required placeholder="תאר את המשימה..."
          />
          <label style={S.label}>מספר עובדים נדרש</label>
          <input style={{ ...S.input, width: 100 }} type="number" min="1" value={form.workers_needed}
            onChange={e => setForm({...form, workers_needed: parseInt(e.target.value)})} />

          <label style={S.label}>הסמכות נדרשות (בחר מספר):</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {certs.map(c => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                padding: '5px 12px', borderRadius: 20, border: '1px solid #ccc',
                backgroundColor: form.required_certification_ids.includes(c.id) ? '#1e3a5f' : 'white',
                color: form.required_certification_ids.includes(c.id) ? 'white' : '#333' }}>
                <input type="checkbox" style={{ display: 'none' }}
                  checked={form.required_certification_ids.includes(c.id)}
                  onChange={() => handleCertToggle(c.id)} />
                {c.name}
              </label>
            ))}
          </div>
          <button type="submit" style={S.btn('#27ae60')}>➕ צור משימה</button>
        </form>
        {msg && <div style={S.msg(msg.ok)}>{msg.text}</div>}
      </div>

      <div style={S.card}>
        <h3>כל המשימות ({tasks.length})</h3>
        
        
        <AnimatePresence>
          {tasks.map(task => (
            <motion.div
              key={task.id}
              layout 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
              style={{ 
                border: '1px solid #e2e8f0', 
                borderRadius: 8, 
                padding: 16, 
                marginBottom: 16,
                backgroundColor: 'white' 
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <strong>{task.description}</strong>
                  <div style={{ fontSize: 13, color: '#666', marginTop: 4 }}>
                    {task.required_certifications ? `🎓 ${task.required_certifications}` : '🌐 פתוחה לכולם'}
                    {' · '}
                    👥 {task.assigned_count}/{task.workers_needed} עובדים
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={S.badge(statusColor[task.status])}>{statusLabel[task.status]}</span>
                  <select style={{ ...S.input, marginBottom: 0, width: 130, fontSize: 13 }}
                    value={task.status} onChange={e => handleStatusChange(task.id, e.target.value)}>
                    <option value="open">פתוחה</option>
                    <option value="in_progress">בביצוע</option>
                    <option value="done">הושלמה</option>
                  </select>
                  <button
                    style={{ ...S.btn('#e53e3e'), padding: '7px 12px', fontSize: 13 }}
                    onClick={() => handleDelete(task.id)}
                    title="מחק משימה">
                    🗑️
                  </button>
                </div>
              </div>

              
              {task.status !== 'done' && (
                <div style={{ marginTop: 12 }}>
                  <AssignedEmployees
                    taskId={task.id}
                    assigned={assignedMap[task.id] || []}
                    onRemove={() => {
                      setEligibleMap(prev => { const n = {...prev}; delete n[task.id]; return n; });
                      load();
                    }}
                  />

                  {task.assigned_count < task.workers_needed ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                      <select
                        style={{ ...S.input, marginBottom: 0, width: 220 }}
                        value={assignMap[task.id] || ''}
                        onFocus={() => loadEligible(task.id)}
                        onChange={e => setAssignMap({...assignMap, [task.id]: e.target.value})}>
                        <option value="">
                          {eligibleLoading[task.id] ? '⏳ טוען...' : `בחר עובד (${task.assigned_count}/${task.workers_needed} שויכו)...`}
                        </option>
                        {(eligibleMap[task.id] || []).map(e => (
                          <option key={e.id} value={e.id}>
                            {e.role === 'manager' ? '👑' : '👷'} {e.full_name} ({e.personal_id})
                          </option>
                        ))}
                        {eligibleMap[task.id] && eligibleMap[task.id].length === 0 && (
                          <option disabled>אין עובדים מתאימים פנויים</option>
                        )}
                      </select>
                      <button style={S.btn()} onClick={() => handleAssign(task.id)}>שייך</button>
                    </div>
                  ) : (
                    <div style={{ marginTop: 8 }}>
                      <span style={{ ...S.badge('#27ae60'), fontSize: 13, padding: '6px 12px' }}>
                        ✅ המשימה מאוישת במלואה
                      </span>
                    </div>
                  )}

                  <button 
                    style={{ ...S.btn('#9b59b6'), marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }} 
                    onClick={() => handleAI(task.id)}
                    disabled={aiLoading[task.id]}
                  >
                    {aiLoading[task.id] ? '⏳ Claude חושב...' : '🤖 המלצת AI'}
                  </button>
                </div>
              )}

              
              <AnimatePresence>
                {aiResult[task.id] && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    style={{ 
                      marginTop: 12, 
                      padding: 12, 
                      backgroundColor: '#f8f0ff', 
                      borderRadius: 8, 
                      borderRight: '4px solid #9b59b6',
                      overflow: 'hidden'
                    }}
                  >
                    <strong>🤖 המלצת AI:</strong>
                    <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: '1.5' }}>{aiResult[task.id]}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      
     
    </div>
  );
}


//  דשבורד עובד

function EmployeeDashboard({ user }) {
  const [myTasks, setMyTasks]     = useState([]);
  const [openTasks, setOpenTasks] = useState([]);
  const [msg, setMsg]             = useState(null);

  const load = async () => {
    const [mine, all] = await Promise.all([api.get('/my-tasks'), api.get('/tasks')]);
    setMyTasks(mine.data);
    const myIds = new Set(mine.data.map(t => t.id));
    setOpenTasks(all.data.filter(t => t.status === 'open' && !myIds.has(t.id)));
  };

  useEffect(() => { load(); }, []);

  const handleSelfAssign = async (taskId) => {
    try {
      await api.post(`/tasks/${taskId}/self-assign`);
      setMsg({ ok: true, text: 'המשימה נוספה אליך!' });
      load();
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.detail || 'שגיאה בלקיחת משימה' });
    }
  };

  const handleDone = async (taskId) => {
    await api.patch(`/tasks/${taskId}/status`, { status: 'done' });
    load();
  };

  return (
    <div>
      <div style={S.card}>
        <h3>המשימות שלי ({myTasks.length})</h3>
        {myTasks.length === 0 && <p style={{ color: '#888' }}>אין לך משימות כרגע.</p>}
        {myTasks.map(task => (
          <div key={task.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 10 }}>
            <div>
              <strong>{task.description}</strong>
              {task.required_certifications &&
                <div style={{ fontSize: 12, color: '#666', marginTop: 3 }}>🎓 {task.required_certifications}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={S.badge(statusColor[task.status])}>{statusLabel[task.status]}</span>
              {task.status !== 'done' &&
                <button style={S.btn('#27ae60')} onClick={() => handleDone(task.id)}>✅ סיימתי</button>}
            </div>
          </div>
        ))}
        {msg && <div style={S.msg(msg.ok)}>{msg.text}</div>}
      </div>

      <div style={S.card}>
        <h3>משימות פנויות שאני יכול לקחת ({openTasks.length})</h3>
        {openTasks.length === 0 && <p style={{ color: '#888' }}>אין משימות פנויות כרגע.</p>}
        {openTasks.map(task => (
          <div key={task.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 10 }}>
            <div>
              <strong>{task.description}</strong>
              <div style={{ fontSize: 12, color: '#666', marginTop: 3 }}>
                {task.required_certifications ? `🎓 ${task.required_certifications}` : '🌐 פתוחה לכולם'}
              </div>
            </div>
            <button style={S.btn('#3498db')} onClick={() => handleSelfAssign(task.id)}>➡️ קח משימה</button>
          </div>
        ))}
      </div>
    </div>
  );
}


//  היסטוריית משימות שהושלמו

function HistoryPage() {
  const [history, setHistory] = useState([]);
  const [search, setSearch]   = useState('');

  useEffect(() => {
    api.get('/history').then(r => setHistory(r.data)).catch(() => {});
  }, []);

  const filtered = history.filter(t =>
    t.description.includes(search) ||
    (t.assigned_employees || '').includes(search) ||
    (t.required_certifications || '').includes(search)
  );

  return (
    <div style={S.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>📜 היסטוריית משימות שהושלמו ({history.length})</h3>
        <input
          style={{ ...S.input, marginBottom: 0, width: 220 }}
          placeholder="חיפוש..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 && (
        <p style={{ color: '#888', textAlign: 'center', padding: 32 }}>
          {history.length === 0 ? 'אין משימות שהושלמו עדיין.' : 'לא נמצאו תוצאות.'}
        </p>
      )}

      <table style={S.table}>
        {filtered.length > 0 && (
          <thead>
            <tr>
              <th style={S.th}>#</th>
              <th style={S.th}>תיאור המשימה</th>
              <th style={S.th}>הסמכות נדרשות</th>
              <th style={S.th}>ביצעו</th>
            </tr>
          </thead>
        )}
        <tbody>
          {filtered.map((task, i) => (
            <tr key={task.id}>
              <td style={{ ...S.td, color: '#999', width: 40 }}>{i + 1}</td>
              <td style={S.td}><strong>{task.description}</strong></td>
              <td style={S.td}>
                {task.required_certifications
                  ? <span style={S.badge('#3498db')}>{task.required_certifications}</span>
                  : <span style={{ color: '#999' }}>ללא</span>}
              </td>
              <td style={S.td}>
                {task.assigned_employees
                  ? task.assigned_employees.split(', ').map((name, j) => (
                      <span key={j} style={{ ...S.badge('#27ae60'), marginLeft: 4 }}>{name}</span>
                    ))
                  : <span style={{ color: '#999' }}>לא שויך עובד</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


//  APP ROOT

export default function App() {
  const [user, setUser]   = useState(null);
  const [tab, setTab]     = useState('tasks');
  const [certs, setCerts] = useState([]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const saved = localStorage.getItem('user');
    if (token && saved) setUser(JSON.parse(saved));
  }, []);

  useEffect(() => {
    if (user) {
      api.get('/certifications').then(r => setCerts(r.data)).catch(() => {});
    }
  }, [user]);

  const handleLogin = (data) => {
    localStorage.setItem('user', JSON.stringify(data));
    setUser(data);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  if (!user) return <LoginPage onLogin={handleLogin} />;

  const isManager = user.role === 'manager';

  return (
    <div style={S.page}>
      <header style={S.header}>
        <h2 style={{ margin: 0 }}>🏗️ מערכת ניהול צוות</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span>{isManager ? '👑' : '👷'} {user.full_name}</span>
          <button onClick={handleLogout} style={{ ...S.btn('#c0392b'), padding: '7px 14px' }}>יציאה</button>
        </div>
      </header>

      <main style={S.main}>
        <div style={S.tabs}>
          {isManager && <>
            <button style={S.tab(tab === 'tasks')}     onClick={() => setTab('tasks')}>📋 ניהול משימות</button>
            <button style={S.tab(tab === 'employees')} onClick={() => setTab('employees')}>👥 ניהול עובדים</button>
          </>}
          {!isManager && <>
            <button style={S.tab(tab === 'my')}   onClick={() => setTab('my')}>📌 המשימות שלי</button>
          </>}
          <button style={S.tab(tab === 'history')} onClick={() => setTab('history')}>📜 היסטוריה</button>
        </div>

        {isManager && tab === 'tasks'     && <ManageTasks     certs={certs} />}
        {isManager && tab === 'employees' && <ManageEmployees certs={certs} />}
        {!isManager && tab === 'my'       && <EmployeeDashboard user={user} />}
        {tab === 'history'                && <HistoryPage />}
      </main>
    </div>
  );
}
