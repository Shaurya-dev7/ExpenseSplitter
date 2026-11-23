import { useEffect, useState } from 'react';
import { Plus, ArrowRight, ArrowUpRight, Check, LoaderCircle, Palmtree, ShieldCheck, Sparkles, Sun, Trash2 } from 'lucide-react';
import { validateGroup } from '../utils/group-validation.js';
import { extractGroupCode } from '../utils/group-code.js';
import { useAuth } from '../contexts/AuthContext';

type ApiError = Error & { errors?: Record<string, string> };
export default function GroupHome({ onOpen, onDemo, api }: { onOpen: (id: string) => void; onDemo: () => void; api: (path: string, method?: string, body?: unknown) => Promise<any> }) {
  const { user, friends } = useAuth();
  const [name, setName] = useState('');
  const [members, setMembers] = useState(() => [user ? `@${user.username}` : '', '']);
  const [code, setCode] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [createError, setCreateError] = useState('');
  const [joinError, setJoinError] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => {
    if (!user) return;
    const self = `@${user.username}`;
    setMembers(current => { const next = [self, ...current.filter(value => value.trim() && value.trim().toLowerCase() !== self.toLowerCase())].slice(0, 20); return next.length < 2 ? [...next, ''] : next; });
  }, [user?.id]);
  function clearField(field: string) { setFields(current => { const next = { ...current }; delete next[field]; return next; }); }
  return <div className="home-layout"><section className="home-intro"><span className="trip-label"><Sparkles size={13} /> GOOD TIMES, FAIRLY SHARED</span><h1>Split the bill.<br />Keep the <em>memories.</em></h1><p>For weekend getaways, shared flats, and everything in between. Less awkward maths. More being together.</p><div className="home-perks"><span><Check size={16} /> No sign-up</span><span><Check size={16} /> Fair to the last paise</span><span><Check size={16} /> Always in sync</span></div><button className="text-button" onClick={onDemo}>Take a look around <ArrowUpRight size={17} /></button><div className="home-art"><Palmtree size={150} strokeWidth={0.8} /><Sun size={80} strokeWidth={0.8} /></div></section>
    <section className="home-card"><span className="eyebrow">YOUR PEOPLE. YOUR SHARED LITTLE THINGS.</span><h2>Start something together.</h2><p>One group code or link is all you need.</p>
      <form noValidate aria-label="Create group" onSubmit={async event => {
        event.preventDefault(); setCreateError('');
        const valid = validateGroup({ name, members }); setFields(valid.errors);
        if (Object.keys(valid.errors).length) return;
        setBusy('create');
        try { const group = await api('', 'POST', { name: valid.name, members: valid.members }); onOpen(group.id); }
        catch (error) { const e = error as ApiError; if (e.errors) setFields(e.errors); else setCreateError(e.message); }
        finally { setBusy(''); }
      }}>
        <label className="field" htmlFor="create-group-name">Group name<input id="create-group-name" aria-label="Group name" autoComplete="off" required maxLength={60} value={name} aria-invalid={!!fields.name} aria-describedby={fields.name ? 'group-name-error' : undefined} onChange={event => { setName(event.target.value); clearField('name'); }} placeholder="e.g. The weekend escape" />{fields.name && <span id="group-name-error" className="field-error" role="alert">{fields.name}</span>}</label>
        {user && friends.length > 0 && <><p className="saved-friends-label">ADD YOUR SAVED FRIENDS</p><div className="saved-friend-chips">{friends.map(friend => { const name = `@${friend.username}`, selected = members.some(member => member.trim().toLowerCase() === name.toLowerCase()); return <button key={friend.id} type="button" disabled={!!busy || selected || (members.length >= 20 && !members.some(member => !member.trim()))} onClick={() => { setMembers(current => { if (current.some(value => value.trim().toLowerCase() === name.toLowerCase())) return current; const blank = current.findIndex(value => !value.trim()); return blank >= 0 ? current.map((value, index) => index === blank ? name : value) : current.length < 20 ? [...current, name] : current; }); setFields({}); }}>{selected ? <Check size={12} /> : <Plus size={12} />}{name}</button>; })}</div></>}
        <fieldset className="member-inputs"><legend>Who's coming?</legend><p className="form-hint">2–20 friends. Everyone gets their own saved share.</p>{members.map((value, index) => <div className="dynamic-member" key={index}><label className="field" htmlFor={`create-member-${index}`}>Member {index + 1}{user && index === 0 && <span className="member-self-note">You’re automatically included.</span>}<input id={`create-member-${index}`} aria-label={`Member ${index + 1}`} readOnly={!!user && index === 0} autoComplete="off" required maxLength={40} value={value} placeholder={index === 0 ? 'e.g. Asha' : index === 1 ? 'e.g. Ben' : 'Friend’s name'} aria-invalid={!!fields[`members.${index}`]} aria-describedby={fields[`members.${index}`] ? `member-error-${index}` : undefined} onChange={event => { setMembers(current => current.map((name, i) => i === index ? event.target.value : name)); clearField(`members.${index}`); }} />{fields[`members.${index}`] && <span className="field-error" id={`member-error-${index}`} role="alert">{fields[`members.${index}`]}</span>}</label><button type="button" className="icon-button remove-member" disabled={members.length <= 2 || !!busy || (!!user && index === 0)} aria-label={`Remove member ${index + 1}`} onClick={() => { setMembers(current => current.filter((_, i) => i !== index)); setFields({}); }}><Trash2 size={16} /></button></div>)}{fields.members && <p className="field-error" role="alert">{fields.members}</p>}<button type="button" className="text-button" disabled={members.length >= 20 || !!busy} onClick={() => { setMembers(current => [...current, '']); clearField('members'); }}><Plus size={15} /> Add another friend <span className="form-hint">{members.length}/20</span></button></fieldset>
        {createError && <p className="form-error" role="alert">{createError}</p>}<button className="button primary full-width" disabled={!!busy}>{busy === 'create' ? <LoaderCircle size={17} className="spin" /> : <Plus size={17} />} {busy === 'create' ? 'Creating group…' : 'Create your group'}</button>
      </form>
      <div className="or-divider"><span />Already part of the gang?<span /></div><form noValidate aria-label="Join group" onSubmit={async event => {
        event.preventDefault(); setJoinError('');
        try { const id = extractGroupCode(code); setBusy('join'); const group = await api(`/${encodeURIComponent(id)}`); onOpen(group.id); }
        catch (error) { setJoinError((error as Error).message); }
        finally { setBusy(''); }
      }}><label className="field" htmlFor="join-group-code">Group code or link<input id="join-group-code" required autoComplete="off" value={code} onChange={event => { setCode(event.target.value); setJoinError(''); }} aria-invalid={!!joinError} aria-describedby={joinError ? 'join-error' : 'join-hint'} placeholder="Paste a group code or invite link" /><span className="form-hint" id="join-hint">We’ll check the group before you join.</span></label>{joinError && <p className="form-error" id="join-error" role="alert">{joinError}</p>}<button className="button secondary full-width" disabled={!!busy}>{busy === 'join' ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />}{busy === 'join' ? 'Finding your group…' : 'Join group'}</button></form><div className="home-privacy"><ShieldCheck size={14} /> Anyone with the code or link can access the group.</div>
    </section></div>;
}
