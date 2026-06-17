import React, { useEffect, useState } from 'react';
import { T } from './theme';

declare const window: any;

interface Prospect {
  id: number; season: number;
  first_name: string; last_name: string;
  position: string; overall_rating: number;
  dev_trait: string; age: number;
  is_drafted: number;
  draft_round: number | null; draft_pick: number | null;
  drafted_by_team_id: number | null;
  scouted: number;
}
interface DraftTeam { id: number; city: string; name: string; abbreviation: string; wins: number; }
interface PickSlot {
  slot: number; originalTeamId: number;
  ownerTeamId: number; ownerCity: string; ownerName: string;
  isTraded: boolean; isUsed: boolean; pickAssetId: number | null;
}
interface MyPick { round: number; slot: number; player: Prospect; grade: string; gradeColor: string; }
interface CpuPick { round: number; pickInRound: number; teamId: number; prospect: Prospect; }
interface Props { userTeam: { id: number; city: string; name: string }; currentSeason: number; onDraftComplete: () => void; }

const POSITIONS = ['ALL','QB','RB','WR','TE','OL','DL','LB','CB','S','K'];
const ROUND_LABELS: Record<number,string> = {1:'1st',2:'2nd',3:'3rd',4:'4th',5:'5th',6:'6th',7:'7th'};
const TRAIT_META: Record<string,{color:string;short:string}> = {
  'Normal':    {color:T.textDim,    short:''},
  'Star':      {color:'#4FC3F7',    short:'S'},
  'Superstar': {color:'#FF8740',    short:'SS'},
  'X-Factor':  {color:'#FFD700',    short:'XF'},
};
const MAX_SCOUTS = 25;

function ovrColor(r:number):string {
  return r>=78?'#4caf50':r>=74?'#FF8740':r>=70?'#4FC3F7':T.textMuted;
}
function draftGrade(ovr:number):{grade:string;color:string} {
  if(ovr>=80) return {grade:'A',  color:'#FFD700'};
  if(ovr>=76) return {grade:'B+', color:'#4caf50'};
  if(ovr>=72) return {grade:'B',  color:'#4caf50'};
  if(ovr>=68) return {grade:'C',  color:'#FF8740'};
  if(ovr>=64) return {grade:'D',  color:'#e57373'};
  return             {grade:'F',  color:T.textMuted};
}
// Deterministic rough range for un-scouted prospects (stable across re-renders)
function maskedOvr(id:number, actual:number):string {
  const offset = ((id * 7) % 9) - 4;
  const low  = Math.max(50, actual + offset - 3);
  const high = Math.min(99, actual + offset + 4);
  return `${low}–${high}`;
}
// Deterministic scout tier with slight noise
function preScoutTier(id:number, ovr:number):{label:string;color:string} {
  const noise = ((id * 13) % 5) === 0 ? 7 : ((id * 13) % 5) === 1 ? -7 : 0;
  const n = ovr + noise;
  if(n>=76) return {label:'Top Prospect', color:'#FFD700'};
  if(n>=72) return {label:'Day 1',        color:'#4caf50'};
  if(n>=68) return {label:'Day 2',        color:'#FF8740'};
  if(n>=63) return {label:'Day 3',        color:'#4FC3F7'};
  return           {label:'Priority FA',  color:T.textMuted};
}

export default function Draft({ userTeam, currentSeason, onDraftComplete }:Props) {
  const [prospects,        setProspects]       = useState<Prospect[]>([]);
  const [draftOrder,       setDraftOrder]      = useState<DraftTeam[]>([]);
  const [roundPickSlots,   setRoundPickSlots]  = useState<PickSlot[]>([]);
  const [userPickSlots,    setUserPickSlots]   = useState<number[]>([]);
  const [currentPickIdx,   setCurrentPickIdx]  = useState(0);
  const [currentRound,     setCurrentRound]    = useState(1);
  const [myPicks,          setMyPicks]         = useState<MyPick[]>([]);
  const [lastCpuPicks,     setLastCpuPicks]    = useState<CpuPick[]>([]);
  const [posFilter,        setPosFilter]       = useState('ALL');
  const [draftGenerated,   setDraftGenerated]  = useState(false);
  const [draftFinished,    setDraftFinished]   = useState(false);
  const [showResults,      setShowResults]     = useState(false);
  const [generating,       setGenerating]      = useState(false);
  const [running,          setRunning]         = useState(false);
  const [scoutsUsed,       setScoutsUsed]      = useState(0);
  const [scouting,         setScouting]        = useState<number|null>(null);

  useEffect(() => { loadDraft(); }, []);

  const loadDraft = async () => {
    const [cls, order, sc] = await Promise.all([
      window.api.getDraftClass(),
      window.api.getDraftOrder(),
      window.api.getScoutCount(),
    ]);
    setProspects(cls); setDraftOrder(order); setScoutsUsed(sc);
    setDraftGenerated(cls.length > 0);

    const drafted = cls.filter((p:Prospect) => p.is_drafted);
    const roundsDone = Math.floor(drafted.length / 32);
    if (roundsDone >= 7) {
      setDraftFinished(true); setCurrentRound(7);
    } else {
      const round = roundsDone + 1;
      setCurrentRound(round);
      await loadRoundSlots(round);
    }
    const mine = cls.filter((p:Prospect) => p.is_drafted && p.drafted_by_team_id === userTeam.id);
    setMyPicks(mine.map((p:Prospect) => {
      const g = draftGrade(p.overall_rating);
      return { round:p.draft_round!, slot:(p.draft_pick!-1)%32+1, player:p, grade:g.grade, gradeColor:g.color };
    }));
  };

  const loadRoundSlots = async (round:number) => {
    const slots:PickSlot[] = await window.api.getRoundPickOrder({ round });
    setRoundPickSlots(slots);
    const uSlots = slots.filter(s => s.ownerTeamId === userTeam.id && !s.isUsed).map(s => s.slot);
    setUserPickSlots(uSlots);
    setCurrentPickIdx(0);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    await window.api.generateDraftClass();
    await loadDraft();
    setGenerating(false);
  };

  const handleScout = async (prospectId:number) => {
    if (scoutsUsed >= MAX_SCOUTS || scouting !== null) return;
    setScouting(prospectId);
    const res = await window.api.scoutProspect(prospectId);
    if (res.success) {
      setScoutsUsed(s => s+1);
      const cls = await window.api.getDraftClass();
      setProspects(cls);
    }
    setScouting(null);
  };

  const handlePick = async (prospect:Prospect) => {
    if (running) return;
    setRunning(true);
    const slot = userPickSlots[currentPickIdx] ?? 1;
    const overallPick = (currentRound - 1) * 32 + slot;
    await window.api.makeDraftPick({ prospectId:prospect.id, teamId:userTeam.id, round:currentRound, pick:overallPick });

    const g = draftGrade(prospect.overall_rating);
    setMyPicks(prev => [...prev, { round:currentRound, slot, player:prospect, grade:g.grade, gradeColor:g.color }]);

    // More user picks remaining this round
    if (currentPickIdx < userPickSlots.length - 1) {
      const cls = await window.api.getDraftClass();
      setProspects(cls);
      setCurrentPickIdx(prev => prev + 1);
      setRunning(false);
      return;
    }

    // All user picks done — run CPU
    const cpuResults:CpuPick[] = await window.api.runCpuRound({ round:currentRound, userTeamId:userTeam.id });
    setLastCpuPicks(cpuResults);
    const cls = await window.api.getDraftClass();
    setProspects(cls);
    setShowResults(true);
    setRunning(false);
  };

  const handleAutoPick = () => {
    const best = prospects.find(p => !p.is_drafted && (posFilter === 'ALL' || p.position === posFilter));
    if (best) handlePick(best);
  };

  const handleNextRound = async () => {
    if (currentRound >= 7) { setDraftFinished(true); return; }
    const next = currentRound + 1;
    setCurrentRound(next);
    setShowResults(false);
    setLastCpuPicks([]);
    await loadRoundSlots(next);
  };

  const handleCompleteDraft = async () => {
    setRunning(true);
    await window.api.completeDraft();
    setRunning(false);
    onDraftComplete();
  };

  const scoutsLeft = MAX_SCOUTS - scoutsUsed;
  const available = prospects.filter(p => !p.is_drafted && (posFilter==='ALL' || p.position===posFilter));
  const pickNum = userPickSlots[currentPickIdx];
  const totalPicksThisRound = userPickSlots.length;

  // ── Generate screen ───────────────────────────────────────────────────────
  if (!draftGenerated) return (
    <div style={{padding:'40px',color:T.textPrimary,background:T.bgPage,minHeight:'100vh'}}>
      <div style={{fontSize:22,fontWeight:'bold',color:'#fff',marginBottom:8}}>{currentSeason} NFL Draft</div>
      <div style={{fontSize:12,color:T.textMuted,marginBottom:32}}>Generate the rookie class before the draft begins — 280 prospects across all positions.</div>
      <button onClick={handleGenerate} disabled={generating} style={{padding:'14px 32px',background:T.bgGreen,border:'1px solid #4caf50',borderRadius:6,color:'#4caf50',fontSize:14,fontWeight:'bold',cursor:'pointer'}}>
        {generating ? 'Generating...' : '▶ Generate Draft Class'}
      </button>
    </div>
  );

  // ── Post-draft summary ────────────────────────────────────────────────────
  if (draftFinished) {
    const sorted = [...myPicks].sort((a,b)=>a.round-b.round);
    const bestPick = sorted.reduce((best,p) => p.player.overall_rating > best.player.overall_rating ? p : best, sorted[0]);
    const gpa = sorted.reduce((s,p) => s + p.player.overall_rating, 0) / Math.max(sorted.length,1);
    const classGrade = draftGrade(Math.round(gpa));
    return (
      <div style={{padding:'32px',color:T.textPrimary,background:T.bgPage,minHeight:'100vh'}}>
        <div style={{fontSize:22,fontWeight:'bold',color:'#fff',marginBottom:4}}>Draft Complete</div>
        <div style={{fontSize:12,color:T.textMuted,marginBottom:24}}>{currentSeason} NFL Draft · {userTeam.city} {userTeam.name}</div>

        {/* Class grade */}
        <div style={{display:'flex',gap:16,marginBottom:24,flexWrap:'wrap'}}>
          <div style={{background:T.bgPanel,border:`1px solid ${T.borderFaint}`,borderRadius:8,padding:'14px 20px',minWidth:140}}>
            <div style={{fontSize:10,color:T.textDim,letterSpacing:1,marginBottom:6}}>DRAFT CLASS GRADE</div>
            <div style={{fontSize:36,fontWeight:900,color:classGrade.color}}>{classGrade.grade}</div>
          </div>
          <div style={{background:T.bgPanel,border:`1px solid ${T.borderFaint}`,borderRadius:8,padding:'14px 20px',minWidth:140}}>
            <div style={{fontSize:10,color:T.textDim,letterSpacing:1,marginBottom:6}}>PICKS MADE</div>
            <div style={{fontSize:28,fontWeight:700,color:T.textPrimary}}>{sorted.length}</div>
          </div>
          {bestPick && (
            <div style={{background:T.bgPanel,border:'1px solid #FFD70033',borderRadius:8,padding:'14px 20px',flex:1}}>
              <div style={{fontSize:10,color:'#FFD700',letterSpacing:1,marginBottom:6}}>BEST PICK</div>
              <div style={{fontSize:15,fontWeight:700,color:T.textPrimary}}>{bestPick.player.first_name} {bestPick.player.last_name}</div>
              <div style={{fontSize:11,color:T.textMuted}}>{bestPick.player.position} · {bestPick.player.overall_rating} OVR · Round {bestPick.round}</div>
            </div>
          )}
        </div>

        {/* Pick list */}
        <div style={{background:T.bgPanel,border:`1px solid ${T.borderFaint}`,borderRadius:8,padding:'16px 20px',marginBottom:24,maxWidth:600}}>
          <div style={{fontSize:10,color:T.textDim,letterSpacing:2,marginBottom:14}}>YOUR DRAFT HAUL</div>
          {sorted.map(pick => {
            const trait = TRAIT_META[pick.player.dev_trait] ?? TRAIT_META['Normal'];
            return (
              <div key={`${pick.round}-${pick.slot}`} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:`1px solid ${T.borderFaint}`}}>
                <span style={{fontSize:10,color:T.textDim,width:60,flexShrink:0}}>{ROUND_LABELS[pick.round]} Rd #{pick.slot}</span>
                <span style={{fontSize:13,fontWeight:'bold',color:T.textPrimary,flex:1}}>{pick.player.first_name} {pick.player.last_name}</span>
                <span style={{fontSize:10,color:T.textMuted}}>{pick.player.position}</span>
                {trait.short && <span style={{fontSize:9,padding:'1px 5px',borderRadius:3,background:trait.color+'22',color:trait.color,fontWeight:'bold'}}>{trait.short}</span>}
                <span style={{fontSize:13,fontWeight:'bold',color:ovrColor(pick.player.overall_rating)}}>{pick.player.overall_rating}</span>
                <span style={{fontSize:11,fontWeight:900,color:pick.gradeColor,minWidth:28,textAlign:'right'}}>{pick.grade}</span>
              </div>
            );
          })}
        </div>
        <button onClick={handleCompleteDraft} disabled={running} style={{padding:'10px 28px',background:T.bgGreen,border:'1px solid #4caf50',borderRadius:6,color:'#4caf50',fontSize:13,fontWeight:'bold',cursor:'pointer'}}>
          {running ? 'Processing...' : '✓ Complete Draft & Return to Offseason'}
        </button>
      </div>
    );
  }

  // ── Active draft ──────────────────────────────────────────────────────────
  return (
    <div style={{padding:'20px 28px',color:T.textPrimary,background:T.bgPage,minHeight:'100vh'}}>

      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
        <div>
          <div style={{fontSize:20,fontWeight:'bold',color:'#fff',letterSpacing:1}}>{currentSeason} NFL Draft</div>
          <div style={{display:'flex',gap:20,marginTop:4,fontSize:11,color:T.textMuted}}>
            <span>Round {currentRound} of 7</span>
            <span>{available.length} prospects available</span>
            {totalPicksThisRound > 1 && !showResults && <span style={{color:'#FF8740'}}>You have {totalPicksThisRound} picks this round (Pick {currentPickIdx+1} of {totalPicksThisRound})</span>}
          </div>
        </div>
        {/* Scout counter */}
        <div style={{background:T.bgPanel,border:`1px solid ${T.borderFaint}`,borderRadius:6,padding:'8px 14px',textAlign:'right'}}>
          <div style={{fontSize:10,color:T.textDim,letterSpacing:1}}>SCOUTS</div>
          <div style={{fontSize:16,fontWeight:700,color:scoutsLeft>5?'#4caf50':scoutsLeft>0?'#FF8740':'#e57373'}}>
            {scoutsLeft} / {MAX_SCOUTS}
          </div>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 280px',gap:16}}>

        {/* LEFT: Prospect Board */}
        <div>
          {/* On the clock */}
          {!showResults && userPickSlots.length > 0 && (
            <div style={{background:'#0d2a0d',border:'1px solid #1a4a1a',borderRadius:8,padding:'12px 16px',marginBottom:12}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontSize:10,color:'#4caf50',letterSpacing:2,marginBottom:2}}>
                    ON THE CLOCK — ROUND {currentRound}{totalPicksThisRound > 1 ? ` · PICK ${currentPickIdx+1}/${totalPicksThisRound}` : ''} · SLOT #{pickNum}
                  </div>
                  <div style={{fontSize:16,fontWeight:'bold',color:'#fff'}}>{userTeam.city} {userTeam.name}</div>
                </div>
                <button onClick={handleAutoPick} disabled={running} style={{padding:'6px 14px',background:T.bgPanel,border:'1px solid #2a4a2a',borderRadius:4,color:'#4caf50',fontSize:11,cursor:'pointer'}}>
                  ⚡ Auto-Pick BPA
                </button>
              </div>
            </div>
          )}

          {/* Round results panel */}
          {showResults && (
            <div style={{background:T.bgPanel,border:`1px solid ${T.borderFaint}`,borderRadius:8,padding:'14px 16px',marginBottom:12}}>
              <div style={{fontSize:10,color:'#FF8740',letterSpacing:2,marginBottom:10}}>ROUND {currentRound} RESULTS</div>
              {/* User's picks this round */}
              {myPicks.filter(p=>p.round===currentRound).map((pick,i) => {
                const trait = TRAIT_META[pick.player.dev_trait] ?? TRAIT_META['Normal'];
                return (
                  <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 0',borderBottom:`1px solid ${T.borderFaint}`}}>
                    <span style={{fontSize:9,background:'#FF8740',color:'#000',padding:'1px 6px',borderRadius:3,fontWeight:'bold',flexShrink:0}}>YOUR PICK #{pick.slot}</span>
                    <span style={{fontSize:12,fontWeight:700,color:T.textPrimary,flex:1}}>{pick.player.first_name} {pick.player.last_name}</span>
                    <span style={{fontSize:10,color:T.textMuted}}>{pick.player.position}</span>
                    {trait.short && <span style={{fontSize:9,padding:'1px 4px',background:trait.color+'22',color:trait.color,borderRadius:2,fontWeight:700}}>{trait.short}</span>}
                    <span style={{fontSize:12,fontWeight:700,color:ovrColor(pick.player.overall_rating)}}>{pick.player.overall_rating}</span>
                    <span style={{fontSize:11,fontWeight:900,color:pick.gradeColor}}>{pick.grade}</span>
                  </div>
                );
              })}
              {/* CPU picks summary */}
              {lastCpuPicks.length > 0 && (
                <div style={{marginTop:10}}>
                  <div style={{fontSize:10,color:T.textDim,letterSpacing:1,marginBottom:6}}>CPU PICKS ({lastCpuPicks.length})</div>
                  <div style={{maxHeight:200,overflowY:'auto'}}>
                    {lastCpuPicks.map((cp,i) => {
                      const trait = TRAIT_META[cp.prospect.dev_trait] ?? TRAIT_META['Normal'];
                      const slot = roundPickSlots.find(s => s.ownerTeamId === cp.teamId && !s.isUsed);
                      const teamName = draftOrder.find(t => t.id === cp.teamId);
                      return (
                        <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'4px 0',borderBottom:`1px solid ${T.borderFaint}22`}}>
                          <span style={{fontSize:10,color:T.textDim,width:18,textAlign:'right'}}>{cp.pickInRound}</span>
                          <span style={{fontSize:10,color:T.textMuted,width:90,flexShrink:0,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{teamName?.city} {teamName?.name}</span>
                          <span style={{fontSize:11,color:T.textPrimary,flex:1}}>{cp.prospect.first_name} {cp.prospect.last_name}</span>
                          <span style={{fontSize:10,color:T.textDim}}>{cp.prospect.position}</span>
                          {trait.short && <span style={{fontSize:8,padding:'1px 3px',background:trait.color+'22',color:trait.color,borderRadius:2,fontWeight:700}}>{trait.short}</span>}
                          <span style={{fontSize:11,fontWeight:700,color:ovrColor(cp.prospect.overall_rating)}}>{cp.prospect.overall_rating}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <button onClick={handleNextRound} style={{marginTop:12,padding:'7px 18px',background:'#FF8740',border:'none',borderRadius:4,color:'#000',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                {currentRound >= 7 ? 'View Draft Summary →' : `Start Round ${currentRound+1} →`}
              </button>
            </div>
          )}

          {/* Position filter */}
          <div style={{display:'flex',gap:4,flexWrap:'wrap',marginBottom:10}}>
            {POSITIONS.map(pos => (
              <button key={pos} onClick={()=>setPosFilter(pos)}
                style={{padding:'2px 7px',background:posFilter===pos?'#FF8740':T.bgCard,border:`1px solid ${posFilter===pos?'#FF8740':T.borderFaint}`,borderRadius:3,color:posFilter===pos?'#000':T.textMuted,fontSize:10,cursor:'pointer',fontWeight:posFilter===pos?700:400}}>
                {pos}
              </button>
            ))}
          </div>

          {/* Prospect list header */}
          <div style={{display:'grid',gridTemplateColumns:'28px 1fr 42px 90px 50px 60px 70px',gap:4,padding:'4px 8px',marginBottom:4}}>
            {['#','NAME','POS','SCOUTING','AGE','OVR',''].map((h,i) => (
              <span key={i} style={{fontSize:9,color:T.textDim,letterSpacing:1}}>{h}</span>
            ))}
          </div>

          {/* Prospect rows */}
          <div style={{overflowY:'auto',maxHeight:520}}>
            {available.length === 0 && <div style={{color:T.textDim,fontSize:12,padding:12}}>No prospects available.</div>}
            {available.map((p, idx) => {
              const isScout  = p.scouted === 1;
              const tier     = preScoutTier(p.id, p.overall_rating);
              const trait    = TRAIT_META[p.dev_trait] ?? TRAIT_META['Normal'];
              const canPick  = !showResults && userPickSlots.length > 0 && !running;
              const canScout = !isScout && scoutsLeft > 0 && scouting === null;
              return (
                <div key={p.id}
                  onClick={() => canPick && handlePick(p)}
                  style={{display:'grid',gridTemplateColumns:'28px 1fr 42px 90px 50px 60px 70px',gap:4,alignItems:'center',padding:'6px 8px',marginBottom:2,background:T.bgCard,borderRadius:4,cursor:canPick?'pointer':'default',border:`1px solid ${canPick?'transparent':T.borderFaint}`,transition:'background 0.1s'}}
                  onMouseEnter={e=>{if(canPick)(e.currentTarget as HTMLElement).style.background='#2a2a2a';}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background=T.bgCard;}}
                >
                  <span style={{fontSize:10,color:T.textDim}}>{idx+1}</span>
                  <div>
                    <div style={{fontSize:12,color:T.textPrimary,fontWeight:600}}>{p.first_name} {p.last_name}</div>
                    <div style={{fontSize:9,color:T.textDim}}>Age {p.age}</div>
                  </div>
                  <span style={{fontSize:11,color:T.textMuted,fontWeight:600}}>{p.position}</span>
                  {/* Scouting info */}
                  <div>
                    {isScout ? (
                      <span style={{fontSize:9,padding:'1px 5px',background:'#4caf5022',color:'#4caf50',borderRadius:3,fontWeight:700}}>SCOUTED</span>
                    ) : (
                      <span style={{fontSize:9,padding:'1px 5px',background:tier.color+'22',color:tier.color,borderRadius:3}}>{tier.label}</span>
                    )}
                  </div>
                  {/* Age shown */}
                  <span style={{fontSize:10,color:T.textDim}}>{p.age}</span>
                  {/* OVR — masked if not scouted */}
                  <div style={{textAlign:'right'}}>
                    {isScout ? (
                      <span style={{fontSize:13,fontWeight:700,color:ovrColor(p.overall_rating)}}>{p.overall_rating}</span>
                    ) : (
                      <span style={{fontSize:11,color:T.textMuted}}>{maskedOvr(p.id,p.overall_rating)}</span>
                    )}
                    {isScout && trait.short && (
                      <span style={{fontSize:8,marginLeft:4,padding:'1px 3px',background:trait.color+'22',color:trait.color,borderRadius:2,fontWeight:700}}>{trait.short}</span>
                    )}
                  </div>
                  {/* Scout button */}
                  <div style={{textAlign:'right'}}>
                    {!isScout && (
                      <button
                        onClick={e=>{e.stopPropagation(); canScout && handleScout(p.id);}}
                        disabled={!canScout || scouting===p.id}
                        style={{fontSize:9,padding:'2px 6px',background:canScout?T.bgInput:'transparent',border:`1px solid ${canScout?T.borderFaint:'transparent'}`,borderRadius:3,color:canScout?T.textMuted:T.textDim,cursor:canScout?'pointer':'not-allowed'}}>
                        {scouting===p.id?'...':'Scout'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT: My picks sidebar */}
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={{background:T.bgPanel,border:`1px solid ${T.borderFaint}`,borderRadius:8,padding:'12px',flex:1,overflowY:'auto',maxHeight:640}}>
            <div style={{fontSize:10,color:T.textDim,letterSpacing:1,marginBottom:10}}>YOUR PICKS SO FAR</div>
            {myPicks.length === 0 && <div style={{color:T.textDim,fontSize:11}}>None yet.</div>}
            {[...myPicks].sort((a,b)=>a.round-b.round||a.slot-b.slot).map((pick,i) => {
              const trait = TRAIT_META[pick.player.dev_trait] ?? TRAIT_META['Normal'];
              return (
                <div key={i} style={{padding:'7px 0',borderBottom:`1px solid ${T.borderFaint}`}}>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <span style={{fontSize:9,color:T.textDim,width:52,flexShrink:0}}>Rd {pick.round} #{pick.slot}</span>
                    <span style={{fontSize:11,fontWeight:700,color:T.textPrimary,flex:1}}>{pick.player.first_name} {pick.player.last_name}</span>
                    <span style={{fontSize:11,fontWeight:900,color:pick.gradeColor}}>{pick.grade}</span>
                  </div>
                  <div style={{display:'flex',gap:6,marginTop:2,paddingLeft:58}}>
                    <span style={{fontSize:10,color:T.textMuted}}>{pick.player.position}</span>
                    <span style={{fontSize:10,fontWeight:700,color:ovrColor(pick.player.overall_rating)}}>{pick.player.overall_rating} OVR</span>
                    {trait.short && <span style={{fontSize:8,padding:'1px 4px',background:trait.color+'22',color:trait.color,borderRadius:2,fontWeight:700}}>{trait.short}</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pick order for this round */}
          <div style={{background:T.bgPanel,border:`1px solid ${T.borderFaint}`,borderRadius:8,padding:'12px'}}>
            <div style={{fontSize:10,color:T.textDim,letterSpacing:1,marginBottom:8}}>ROUND {currentRound} ORDER</div>
            <div style={{maxHeight:180,overflowY:'auto'}}>
              {roundPickSlots.slice(0,32).map(s => {
                const team = draftOrder.find(t => t.id === s.ownerTeamId);
                const isUser = s.ownerTeamId === userTeam.id;
                return (
                  <div key={s.slot} style={{display:'flex',gap:6,padding:'3px 0',alignItems:'center'}}>
                    <span style={{fontSize:9,color:T.textDim,width:18,textAlign:'right',flexShrink:0}}>{s.slot}</span>
                    <span style={{fontSize:10,color:isUser?'#FF8740':T.textMuted,fontWeight:isUser?700:400,flex:1,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>
                      {isUser ? `★ ${userTeam.city} ${userTeam.name}` : `${s.ownerCity} ${s.ownerName}`}
                    </span>
                    {s.isTraded && <span style={{fontSize:8,color:'#4FC3F7'}}>TRD</span>}
                    {s.isUsed && <span style={{fontSize:8,color:T.textDim}}>✓</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
