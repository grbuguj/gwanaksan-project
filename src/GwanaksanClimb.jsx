import { useState, useEffect, useRef, useCallback } from "react";
import * as Tone from "tone";
import { db } from "./firebase";
import { collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp } from "firebase/firestore";

const TOTAL_STEPS = 100;
const GWANAKSAN_HEIGHT = 632;
const MAX_LIVES = 3;

const COLORS = {
  sky1:"#1a1a2e", sky2:"#16213e", sky3:"#0f3460",
  mountainDark:"#1a3a0a",
  stairLeft:"#8B6914", stairRight:"#A67C00", stairShadow:"#5C4A0E",
  accent:"#FFD700", accentDark:"#B8960F",
  character:"#FF6B35", characterDark:"#CC4400",
  certBg:"#FFF8E7", certBorder:"#8B6914", certAccent:"#e94560", stamp:"#e94560",
};
const FONT_PIXEL = `"Press Start 2P", monospace`;

// ─── Sound Engine ────────────────────────────────
class SoundEngine {
  constructor() { this.ready = false; }
  async init() {
    if (this.ready) return;
    await Tone.start();
    this.stepSynth = new Tone.Synth({ oscillator:{type:"square"}, envelope:{attack:0.005,decay:0.08,sustain:0,release:0.05}, volume:-12 }).toDestination();
    this.wrongSynth = new Tone.NoiseSynth({ noise:{type:"brown"}, envelope:{attack:0.01,decay:0.15,sustain:0,release:0.05}, volume:-15 }).toDestination();
    this.lifeSynth = new Tone.Synth({ oscillator:{type:"sawtooth"}, envelope:{attack:0.01,decay:0.3,sustain:0,release:0.1}, volume:-10 }).toDestination();
    this.comboSynth = new Tone.PolySynth(Tone.Synth, { oscillator:{type:"triangle"}, envelope:{attack:0.01,decay:0.2,sustain:0.05,release:0.3}, volume:-14 }).toDestination();
    this.gameOverSynth = new Tone.Synth({ oscillator:{type:"triangle"}, envelope:{attack:0.01,decay:0.5,sustain:0.1,release:0.5}, volume:-8 }).toDestination();
    this.victorySynth = new Tone.PolySynth(Tone.Synth, { oscillator:{type:"square"}, envelope:{attack:0.01,decay:0.3,sustain:0.2,release:0.4}, volume:-10 }).toDestination();
    this.uiSynth = new Tone.Synth({ oscillator:{type:"sine"}, envelope:{attack:0.005,decay:0.05,sustain:0,release:0.02}, volume:-18 }).toDestination();
    this.milestoneSynth = new Tone.PolySynth(Tone.Synth, { oscillator:{type:"sine"}, envelope:{attack:0.02,decay:0.3,sustain:0.1,release:0.4}, volume:-12 }).toDestination();
    this.ready = true;
  }
  playStep(combo) { if(!this.ready)return; this.stepSynth.triggerAttackRelease(Tone.Frequency(60+Math.min(combo,20),"midi").toFrequency(),"32n"); }
  playWrong() { if(!this.ready)return; this.wrongSynth.triggerAttackRelease("16n"); }
  playLoseLife(livesLeft) { if(!this.ready)return; this.lifeSynth.triggerAttackRelease([300,220,150][Math.max(0,livesLeft)]||150,"8n"); }
  playComboMilestone() { if(!this.ready)return; const n=Tone.now(); this.comboSynth.triggerAttackRelease("C5","16n",n); this.comboSynth.triggerAttackRelease("E5","16n",n+0.06); this.comboSynth.triggerAttackRelease("G5","16n",n+0.12); }
  playGameOver() { if(!this.ready)return; const n=Tone.now(); this.gameOverSynth.triggerAttackRelease("E4","8n",n); this.gameOverSynth.triggerAttackRelease("C4","8n",n+0.25); this.gameOverSynth.triggerAttackRelease("A3","4n",n+0.5); }
  playSummit() { if(!this.ready)return; const n=Tone.now(); this.victorySynth.triggerAttackRelease("C5","8n",n); this.victorySynth.triggerAttackRelease("E5","8n",n+0.15); this.victorySynth.triggerAttackRelease("G5","8n",n+0.3); this.victorySynth.triggerAttackRelease("C6","4n",n+0.45); }
  playUI() { if(!this.ready)return; this.uiSynth.triggerAttackRelease("A5","32n"); }
  playMilestone() { if(!this.ready)return; const n=Tone.now(); this.milestoneSynth.triggerAttackRelease("E5","16n",n); this.milestoneSynth.triggerAttackRelease("A5","16n",n+0.1); }
}
const sfx = new SoundEngine();

// ─── Stair Generation ────────────────────────────
function generateStairs() {
  const stairs = [];
  for (let i = 0; i < TOTAL_STEPS; i++) {
    let dir;
    if (i >= 3 && stairs[i-1].direction === stairs[i-2].direction && stairs[i-2].direction === stairs[i-3].direction) {
      dir = stairs[i-1].direction === "left" ? "right" : "left";
    } else { dir = Math.random() < 0.5 ? "left" : "right"; }
    stairs.push({ id: i, direction: dir });
  }
  return stairs;
}

// ─── Components ──────────────────────────────────
function PixelCharacter({ direction, isJumping, isStumble }) {
  const base = direction === "right" ? "scaleX(-1)" : "";
  const jump = isJumping ? "translateY(-14px)" : "";
  const t = [jump, base].filter(Boolean).join(" ") || "none";
  return (
    <div style={{ transform:t, opacity:isStumble?0.4:1, transition:"transform 0.13s ease-out, opacity 0.1s", imageRendering:"pixelated", width:32, height:40, position:"relative" }}>
      <div style={{ position:"absolute", top:0, left:8, width:16, height:16, background:"#FFD4A0", borderRadius:2 }} />
      <div style={{ position:"absolute", top:-2, left:6, width:20, height:8, background:"#4A2800", borderRadius:2 }} />
      <div style={{ position:"absolute", top:6, left:11, width:3, height:3, background:"#222" }} />
      <div style={{ position:"absolute", top:6, left:18, width:3, height:3, background:"#222" }} />
      <div style={{ position:"absolute", top:11, left:13, width:6, height:2, background:"#CC6644", borderRadius:1 }} />
      <div style={{ position:"absolute", top:16, left:6, width:20, height:14, background:COLORS.character, borderRadius:2 }} />
      <div style={{ position:"absolute", top:14, left:24, width:6, height:12, background:COLORS.characterDark, borderRadius:1 }} />
      <div style={{ position:"absolute", top:30, left:8, width:6, height:10, background:"#5B4A3F", borderRadius:1 }} />
      <div style={{ position:"absolute", top:30, left:18, width:6, height:10, background:"#5B4A3F", borderRadius:1 }} />
      <div style={{ position:"absolute", top:37, left:6, width:10, height:4, background:"#8B4513", borderRadius:1 }} />
      <div style={{ position:"absolute", top:37, left:16, width:10, height:4, background:"#8B4513", borderRadius:1 }} />
    </div>
  );
}

function MountainBG({ progress }) {
  const g = `linear-gradient(180deg, ${progress>0.7?"#FF6B35":COLORS.sky1} 0%, ${progress>0.7?"#FFD700":COLORS.sky3} 40%, ${progress>0.5?"#e94560":COLORS.sky2} 70%, ${progress>0.3?"#0f3460":COLORS.sky1} 100%)`;
  return (
    <div style={{ position:"absolute", inset:0, background:g, transition:"background 2s ease", overflow:"hidden" }}>
      {progress<0.5 && Array.from({length:20}).map((_,i)=><div key={i} style={{ position:"absolute", left:`${(i*37)%100}%`, top:`${(i*23)%50}%`, width:2, height:2, background:"#fff", opacity:0.3+(i%3)*0.3, animation:`twinkle ${1+(i%3)}s infinite alternate` }} />)}
      <div style={{ position:"absolute", bottom:0, left:0, right:0, height:"40%", background:COLORS.mountainDark, clipPath:"polygon(0% 100%, 0% 60%, 10% 40%, 25% 55%, 40% 20%, 55% 45%, 70% 15%, 85% 50%, 100% 30%, 100% 100%)", opacity:0.5 }} />
      {Array.from({length:8}).map((_,i)=>(
        <div key={i} style={{ position:"absolute", bottom:0, left:`${i*13+2}%`, width:12, height:20+(i%3)*8 }}>
          <div style={{ width:0, height:0, borderLeft:"8px solid transparent", borderRight:"8px solid transparent", borderBottom:`${14+(i%3)*4}px solid #1a4a0a`, position:"absolute", bottom:6, left:-2 }} />
          <div style={{ width:4, height:8, background:"#5C3A1E", position:"absolute", bottom:0, left:4 }} />
        </div>
      ))}
    </div>
  );
}

function Hearts({ lives }) {
  return <div style={{ display:"flex", gap:4 }}>{Array.from({length:MAX_LIVES}).map((_,i)=><span key={i} style={{ fontSize:14, filter:i<lives?"none":"grayscale(1) opacity(0.3)" }}>❤️</span>)}</div>;
}

function Certificate({ nickname, wish, canvasRef, onReady, timeSec, maxCombo, lives }) {
  const fmtTime=(s)=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
  useEffect(()=>{
    const canvas=canvasRef.current; if(!canvas) return;
    const ctx=canvas.getContext("2d"); const W=800,H=600;
    canvas.width=W; canvas.height=H;
    ctx.fillStyle=COLORS.certBg; ctx.fillRect(0,0,W,H);
    ctx.strokeStyle=COLORS.certBorder; ctx.lineWidth=6; ctx.strokeRect(20,20,W-40,H-40);
    ctx.strokeStyle=COLORS.accent; ctx.lineWidth=2; ctx.strokeRect(30,30,W-60,H-60);
    [[35,35],[W-43,35],[35,H-43],[W-43,H-43]].forEach(([x,y])=>{ctx.fillStyle=COLORS.certAccent;ctx.fillRect(x,y,8,8);ctx.fillStyle=COLORS.accent;ctx.fillRect(x+2,y+2,4,4);});
    ctx.fillStyle="#2d501633"; ctx.beginPath(); ctx.moveTo(200,180); ctx.lineTo(320,90); ctx.lineTo(400,110); ctx.lineTo(480,70); ctx.lineTo(600,180); ctx.closePath(); ctx.fill();
    ctx.fillStyle=COLORS.certBorder; ctx.font=`bold 28px ${FONT_PIXEL}`; ctx.textAlign="center";
    ctx.fillText("⛰️ 관악산 등산 완료증 ⛰️", W/2, 100);
    ctx.fillStyle="#666"; ctx.font=`12px ${FONT_PIXEL}`; ctx.fillText("GWANAKSAN SUMMIT CERTIFICATE", W/2, 130);
    ctx.strokeStyle=COLORS.accent; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(150,150); ctx.lineTo(W-150,150); ctx.stroke();
    ctx.fillStyle="#222"; ctx.font=`18px ${FONT_PIXEL}`; ctx.fillText(`등산가: ${nickname}`, W/2, 210);
    ctx.fillStyle=COLORS.character; ctx.font=`14px ${FONT_PIXEL}`; ctx.fillText(`해발 ${GWANAKSAN_HEIGHT}m 정복!`, W/2, 255);
    if(wish){ctx.fillStyle="#444";ctx.font=`11px ${FONT_PIXEL}`;ctx.fillText(`✨ 소원: ${wish.slice(0,20)} ✨`, W/2, 300);}
    // Stats
    ctx.fillStyle="#666"; ctx.font=`10px ${FONT_PIXEL}`;
    const hearts = "❤️".repeat(lives) + "🖤".repeat(MAX_LIVES - lives);
    ctx.fillText(`${hearts}  ⏱️ ${fmtTime(timeSec)}  🔥 최대콤보 x${maxCombo}`, W/2, 340);
    // Date
    const now=new Date();
    ctx.fillStyle="#888"; ctx.font=`10px ${FONT_PIXEL}`; ctx.fillText(`${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,"0")}.${String(now.getDate()).padStart(2,"0")}`, W/2, 375);
    ctx.save(); ctx.translate(W/2,470); ctx.rotate(-0.2);
    ctx.strokeStyle=COLORS.stamp+"BB"; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(0,0,55,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,48,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle=COLORS.stamp+"CC"; ctx.font=`bold 10px ${FONT_PIXEL}`; ctx.textAlign="center";
    ctx.fillText("횃불이유괴단",0,-10); ctx.font=`8px ${FONT_PIXEL}`; ctx.fillText("CERTIFIED",0,10); ctx.fillText("⛰️🔥",0,30);
    ctx.restore(); if(onReady) onReady();
  },[nickname,wish,canvasRef,onReady,timeSec,maxCombo,lives]);
  return <canvas ref={canvasRef} style={{ width:"100%", maxWidth:500, height:"auto", imageRendering:"pixelated", borderRadius:8, boxShadow:"0 8px 32px rgba(0,0,0,0.3)" }} />;
}

// ─── Guestbook (Firebase Firestore) ──────────────
function Guestbook({ nickname, wish, timeSec, maxCombo, lives }) {
  const [entries, setEntries] = useState([]);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadEntries(); }, []);

  const loadEntries = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "guestbook"), orderBy("createdAt", "desc"), limit(50));
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEntries(docs);
    } catch (e) {
      console.error("방명록 불러오기 실패:", e);
      setEntries([]);
    }
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!message.trim()) return;
    sfx.playUI();
    try {
      await addDoc(collection(db, "guestbook"), {
        nickname,
        wish: wish || "",
        message: message.trim().slice(0, 50),
        timeSec,
        maxCombo,
        lives,
        date: new Date().toLocaleDateString("ko-KR"),
        createdAt: serverTimestamp(),
      });
      setSubmitted(true);
      loadEntries(); // 새로고침
    } catch (e) {
      console.error("방명록 저장 실패:", e);
      alert("방명록 저장에 실패했습니다. Firebase 설정을 확인해주세요!");
    }
  };

  const fmtTime = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

  return (
    <div style={{ width:"100%", maxWidth:340, display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ fontSize:12, color:COLORS.accent, textAlign:"center", textShadow:"2px 2px 0 #000" }}>📖 방명록</div>
      {!submitted ? (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <input type="text" value={message} onChange={e=>setMessage(e.target.value.slice(0,50))} onKeyDown={e=>e.key==="Enter"&&handleSubmit()} placeholder="한마디 남기기... (50자)" maxLength={50}
            style={{ width:"100%", padding:"10px 12px", fontFamily:FONT_PIXEL, fontSize:9, background:"rgba(0,0,0,0.6)", border:`2px solid ${COLORS.accent}`, borderRadius:0, color:"#fff", outline:"none" }} />
          <button onClick={handleSubmit} disabled={!message.trim()}
            style={{ fontFamily:FONT_PIXEL, fontSize:9, padding:"10px 16px", background:message.trim()?COLORS.character:"#333", color:"#fff", border:"none", cursor:message.trim()?"pointer":"default", opacity:message.trim()?1:0.5 }}>
            ✍️ 등록
          </button>
        </div>
      ) : (
        <div style={{ fontSize:8, color:"#8f8", textAlign:"center", padding:8 }}>✅ 방명록에 등록되었습니다!</div>
      )}
      <div style={{ maxHeight:240, overflowY:"auto", display:"flex", flexDirection:"column", gap:6, paddingRight:4 }}>
        {loading ? (
          <div style={{ fontSize:8, color:"#888", textAlign:"center", padding:16 }}>불러오는 중...</div>
        ) : entries.length===0 ? (
          <div style={{ fontSize:8, color:"#888", textAlign:"center", padding:16 }}>아직 방명록이 비어있어요!<br/>첫 번째 등산가가 되어보세요 🥾</div>
        ) : entries.map((e) => (
          <div key={e.id} style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,215,0,0.15)", padding:"8px 10px", display:"flex", flexDirection:"column", gap:4 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:9, color:COLORS.accent, fontFamily:FONT_PIXEL }}>🥾 {e.nickname}</span>
              <span style={{ fontSize:7, color:"#666", fontFamily:FONT_PIXEL }}>{e.date}</span>
            </div>
            <div style={{ fontSize:8, color:"#ddd", fontFamily:FONT_PIXEL, lineHeight:1.6, wordBreak:"break-all" }}>{e.message}</div>
            <div style={{ fontSize:7, color:"#777", fontFamily:FONT_PIXEL }}>
              ⏱️{fmtTime(e.timeSec)} | 콤보x{e.maxCombo} | ❤️{e.lives}{e.wish?` | ✨${e.wish}`:""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Ranking ─────────────────────────────────────
function Ranking({ onBack }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadRanking(); }, []);

  const loadRanking = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "guestbook"), orderBy("createdAt", "desc"), limit(100));
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort: timeSec asc → same time: lives desc
      docs.sort((a, b) => {
        if ((a.timeSec || 9999) !== (b.timeSec || 9999)) return (a.timeSec || 9999) - (b.timeSec || 9999);
        return (b.lives || 0) - (a.lives || 0);
      });
      setEntries(docs);
    } catch (e) {
      console.error("랭킹 불러오기 실패:", e);
      setEntries([]);
    }
    setLoading(false);
  };

  const fmtTime = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
  const medals = ["🥇", "🥈", "🥉"];
  const rankColors = ["#FFD700", "#C0C0C0", "#CD7F32"];

  return (
    <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", gap:12, padding:20, zIndex:10, background:"rgba(0,0,0,0.7)", overflowY:"auto" }}>
      <div style={{ fontSize:16, color:COLORS.accent, textShadow:"2px 2px 0 #000", marginTop:16 }}>🏆 등산 랭킹 🏆</div>
      <div style={{ fontSize:8, color:"#aaa" }}>빠른 시간순 (같으면 ❤️ 많은 순)</div>

      <div style={{ width:"100%", maxWidth:360, display:"flex", flexDirection:"column", gap:6, flex:1, overflowY:"auto", paddingBottom:8 }}>
        {loading ? (
          <div style={{ fontSize:8, color:"#888", textAlign:"center", padding:24 }}>불러오는 중...</div>
        ) : entries.length === 0 ? (
          <div style={{ fontSize:8, color:"#888", textAlign:"center", padding:24 }}>아직 기록이 없어요!<br/>첫 번째 등산가가 되어보세요 🥾</div>
        ) : entries.map((e, idx) => {
          const isTop3 = idx < 3;
          const medal = medals[idx] || "";
          const borderColor = isTop3 ? rankColors[idx] : "rgba(255,215,0,0.1)";
          const bgColor = isTop3 ? `${rankColors[idx]}15` : "rgba(255,255,255,0.04)";

          return (
            <div key={e.id} style={{
              background: bgColor,
              border: `${isTop3 ? 2 : 1}px solid ${borderColor}`,
              padding: isTop3 ? "10px 12px" : "8px 10px",
              display: "flex", alignItems: "center", gap: 10,
              transition: "all 0.2s",
            }}>
              {/* Rank number */}
              <div style={{ minWidth: 32, textAlign: "center", fontSize: isTop3 ? 16 : 9, fontFamily: FONT_PIXEL, color: isTop3 ? rankColors[idx] : "#555" }}>
                {medal || `${idx + 1}`}
              </div>

              {/* Info */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: isTop3 ? 10 : 9, color: isTop3 ? "#fff" : "#ccc", fontFamily: FONT_PIXEL, fontWeight: isTop3 ? "bold" : "normal" }}>🥾 {e.nickname}</span>
                  <span style={{ fontSize: 7, color: "#666", fontFamily: FONT_PIXEL }}>{e.date}</span>
                </div>
                <div style={{ fontSize: 8, color: "#aaa", fontFamily: FONT_PIXEL }}>
                  ⏱️ {fmtTime(e.timeSec || 0)} | ❤️ {e.lives || 0} | 🔥 x{e.maxCombo || 0}
                  {e.wish ? ` | ✨${e.wish}` : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={onBack} style={{ ...btnStyle("transparent", COLORS.accent), fontSize:9, padding:"10px 24px", marginBottom:16 }}>← 돌아가기</button>
    </div>
  );
}

function btnStyle(bg, color) {
  return { fontFamily:FONT_PIXEL, fontSize:12, padding:"14px 28px", background:bg, color:color||"#fff", border:"4px solid "+(color||"#fff"), borderRadius:0, cursor:"pointer", textTransform:"uppercase", letterSpacing:1, boxShadow:`4px 4px 0px ${color||"#000"}`, transition:"all 0.1s" };
}

// ─── Main App ────────────────────────────────────
export default function GwanaksanClimb() {
  const [screen, setScreen] = useState("intro");
  const [nickname, setNickname] = useState("");
  const [wish, setWish] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const [stairs, setStairs] = useState([]);
  const [isJumping, setIsJumping] = useState(false);
  const inputLockRef = useRef(false);
  const [isStumble, setIsStumble] = useState(false);
  const [direction, setDirection] = useState("left");
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [shakeScreen, setShakeScreen] = useState(false);
  const [particles, setParticles] = useState([]);
  const [fallAnim, setFallAnim] = useState(false);
  const [certReady, setCertReady] = useState(false);
  const [milestoneText, setMilestoneText] = useState(null);
  const particleId = useRef(0);
  const certCanvasRef = useRef(null);
  const prevMilestoneRef = useRef(-1);

  useEffect(()=>{
    setStairs(generateStairs());
    const link=document.createElement("link");
    link.href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap";
    link.rel="stylesheet"; document.head.appendChild(link);
  },[]);

  const progress = currentStep / TOTAL_STEPS;
  const altitude = Math.round(progress * GWANAKSAN_HEIGHT);
  const nextStair = stairs[currentStep];
  const expectedDir = nextStair ? nextStair.direction : null;

  useEffect(()=>{
    const milestones = [{at:0.25,msg:"🌲 산 중턱..."},{at:0.50,msg:"⛰️ 반 지점 통과!"},{at:0.75,msg:"💪 거의 다 왔다!"},{at:0.90,msg:"🔥 정상이 코앞!"}];
    const pct = currentStep / TOTAL_STEPS;
    for (const m of milestones) {
      if (pct >= m.at && prevMilestoneRef.current < m.at) {
        prevMilestoneRef.current = m.at;
        setMilestoneText(m.msg); sfx.playMilestone();
        setTimeout(()=>setMilestoneText(null),1500); break;
      }
    }
  },[currentStep]);

  const addParticles = useCallback((x,y,count=5)=>{
    const np=Array.from({length:count}).map(()=>({id:particleId.current++, x:x+(Math.random()-0.5)*40, y:y+(Math.random()-0.5)*20, emoji:["✨","⭐","💫","🌟"][Math.floor(Math.random()*4)]}));
    setParticles(p=>[...p,...np]);
    setTimeout(()=>setParticles(p=>p.filter(pp=>!np.find(n=>n.id===pp.id))),800);
  },[]);

  const resetGame = useCallback(()=>{
    setStairs(generateStairs()); setCurrentStep(0); setCombo(0); setMaxCombo(0); setLives(MAX_LIVES); setWish(""); setStartTime(Date.now()); setDirection("left"); setFallAnim(false); setIsJumping(false); setIsStumble(false); setCertReady(false); setMilestoneText(null); prevMilestoneRef.current=-1; inputLockRef.current=false;
  },[]);

  const handleStart = async () => {
    if(!nickname.trim()) return;
    await sfx.init(); sfx.playUI();
    resetGame(); setScreen("playing");
  };

  const handleStep = useCallback((clickDir)=>{
    if(screen!=="playing"||inputLockRef.current||currentStep>=TOTAL_STEPS||fallAnim) return;
    inputLockRef.current = true;
    if(clickDir===expectedDir) {
      setIsJumping(true); setDirection(clickDir);
      const nc=combo+1; setCombo(nc); if(nc>maxCombo) setMaxCombo(nc);
      sfx.playStep(nc);
      if(nc===10||nc===20||nc===30||nc===50) sfx.playComboMilestone();
      addParticles(clickDir==="left"?100:260, 280, nc>5?8:4);
      setCurrentStep(s=>{const next=s+1; if(next>=TOTAL_STEPS){setEndTime(Date.now());sfx.playSummit();setTimeout(()=>setScreen("wish"),800);} return next;});
      setTimeout(()=>{ setIsJumping(false); inputLockRef.current=false; },80);
    } else {
      setIsStumble(true); setShakeScreen(true); setCombo(0);
      sfx.playWrong();
      const newLives = lives - 1;
      setLives(newLives);
      sfx.playLoseLife(newLives);
      if(newLives<=0){
        setFallAnim(true);
        setTimeout(()=>sfx.playGameOver(),200);
        setTimeout(()=>{setScreen("gameover");setFallAnim(false);},800);
      }
      setTimeout(()=>{setIsStumble(false);setShakeScreen(false);inputLockRef.current=false;},250);
    }
  },[screen,currentStep,expectedDir,combo,maxCombo,lives,addParticles,fallAnim]);

  useEffect(()=>{
    const onKey=(e)=>{
      if(e.key==="ArrowLeft"){e.preventDefault();handleStep("left");}
      else if(e.key==="ArrowRight"){e.preventDefault();handleStep("right");}
    };
    window.addEventListener("keydown",onKey);
    return ()=>window.removeEventListener("keydown",onKey);
  },[handleStep]);

  const timeSec = endTime&&startTime ? Math.floor((endTime-startTime)/1000) : 0;
  const formatTime=(s)=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
  const handleCertDownload=()=>{ sfx.playUI(); const c=certCanvasRef.current; if(!c)return; const a=document.createElement("a"); a.download=`관악산_등산완료증_${nickname}.png`; a.href=c.toDataURL("image/png"); a.click(); };

  return (
    <div tabIndex={0} style={{ width:"100%", maxWidth:420, height:"100vh", maxHeight:780, margin:"0 auto", position:"relative", overflow:"hidden", fontFamily:FONT_PIXEL, background:COLORS.sky1, userSelect:"none", outline:"none", transform:shakeScreen?"translateX(4px)":"none", transition:"transform 0.05s" }}>
      <style>{`
        @keyframes twinkle{from{opacity:0.2}to{opacity:0.8}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
        @keyframes fadeParticle{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(-30px) scale(0.5)}}
        @keyframes bounceIn{0%{transform:scale(0);opacity:0}50%{transform:scale(1.2)}100%{transform:scale(1);opacity:1}}
        @keyframes fallDown{0%{transform:translateY(0) rotate(0deg);opacity:1}100%{transform:translateY(300px) rotate(40deg);opacity:0}}
        @keyframes milestoneIn{0%{transform:translateY(20px) scale(0.8);opacity:0}50%{transform:translateY(-5px) scale(1.1);opacity:1}100%{transform:translateY(0) scale(1);opacity:1}}
        input::placeholder{color:#666} *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:rgba(0,0,0,0.2)} ::-webkit-scrollbar-thumb{background:rgba(255,215,0,0.3);border-radius:2px}
      `}</style>

      <MountainBG progress={progress} />

      {/* INTRO */}
      {screen==="intro" && (
        <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:20, padding:30, zIndex:10 }}>
          <div style={{ textAlign:"center", animation:"float 3s ease-in-out infinite" }}>
            <div style={{ fontSize:48, marginBottom:8 }}>⛰️</div>
            <h1 style={{ fontSize:20, color:COLORS.accent, textShadow:"3px 3px 0px #000", lineHeight:1.6, margin:0 }}>관악산<br/>등산 대작전</h1>
          </div>
          <p style={{ fontSize:8, color:"#aaa", textAlign:"center", lineHeight:2.2, margin:0 }}>
            해발 632m 정상까지 100계단!<br/>다음 계단 방향 ◀ ▶ 에 맞춰 클릭<br/>키보드 ← → 도 OK<br/>❤️ 목숨 3개, 다 쓰면 추락!
          </p>
          <div style={{ width:"100%", maxWidth:280, animation:"slideUp 0.5s ease-out" }}>
            <label style={{ fontSize:8, color:COLORS.accent, marginBottom:8, display:"block" }}>닉네임을 입력하세요</label>
            <input type="text" value={nickname} onChange={e=>setNickname(e.target.value.slice(0,10))} onKeyDown={e=>e.key==="Enter"&&handleStart()} placeholder="등산가 이름..." maxLength={10}
              style={{ width:"100%", padding:"12px 16px", fontFamily:FONT_PIXEL, fontSize:12, background:"rgba(0,0,0,0.6)", border:`3px solid ${COLORS.accent}`, borderRadius:0, color:"#fff", outline:"none", boxShadow:`3px 3px 0px ${COLORS.accentDark}` }} />
          </div>
          <button onClick={handleStart} disabled={!nickname.trim()} style={{ ...btnStyle(COLORS.character,"#fff"), opacity:nickname.trim()?1:0.4, fontSize:14, padding:"16px 40px", animation:nickname.trim()?"pulse 1.5s infinite":"none" }}>🥾 등산 시작!</button>
          <button onClick={()=>setScreen("ranking")} style={{ ...btnStyle("transparent",COLORS.accent), fontSize:9, padding:"10px 24px", boxShadow:"none", border:`2px solid ${COLORS.accent}` }}>🏆 명예의전당</button>
          <div style={{ fontSize:7, color:"#555", marginTop:4 }}>횃불이유괴단 제작 🔥</div>
        </div>
      )}

      {/* PLAYING */}
      {screen==="playing" && (
        <div style={{ position:"absolute", inset:0, zIndex:10 }}>
          <div style={{ position:"absolute", top:0, left:0, right:0, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"flex-start", zIndex:20, background:"linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%)" }}>
            <div>
              <div style={{ fontSize:7, color:"#aaa" }}>고도</div>
              <div style={{ fontSize:14, color:COLORS.accent }}>{altitude}m</div>
            </div>
            <div style={{ textAlign:"center" }}>
              <Hearts lives={lives} />
              <div style={{ fontSize:7, color:"#aaa", marginTop:4 }}>{currentStep}/{TOTAL_STEPS}</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:7, color:"#aaa" }}>콤보</div>
              <div style={{ fontSize:14, color:combo>5?COLORS.certAccent:"#fff" }}>x{combo}</div>
            </div>
          </div>

          <div style={{ position:"absolute", right:12, top:60, bottom:80, width:20, background:"rgba(0,0,0,0.4)", border:`2px solid ${COLORS.accent}44`, zIndex:20, overflow:"hidden" }}>
            <div style={{ position:"absolute", bottom:0, left:0, right:0, height:`${progress*100}%`, background:`linear-gradient(180deg, ${COLORS.accent}, ${COLORS.character})`, transition:"height 0.3s ease-out" }} />
            <div style={{ position:"absolute", top:0, left:-2, right:-2, height:3, background:COLORS.certAccent }} />
            <div style={{ position:"absolute", top:4, left:-20, fontSize:8, color:COLORS.certAccent }}>⛰️</div>
            {[0.25,0.5,0.75].map(p=><div key={p} style={{ position:"absolute", bottom:`${p*100}%`, left:0, right:0, height:1, background:"rgba(255,215,0,0.3)" }} />)}
          </div>

          {milestoneText && (
            <div style={{ position:"absolute", top:"32%", left:"50%", transform:"translate(-50%,-50%)", fontSize:10, color:COLORS.accent, textShadow:"2px 2px 0 #000", animation:"milestoneIn 0.5s ease-out", pointerEvents:"none", zIndex:25, whiteSpace:"nowrap", background:"rgba(0,0,0,0.5)", padding:"8px 16px" }}>
              {milestoneText}
            </div>
          )}

          <div style={{ position:"absolute", left:0, right:40, top:80, bottom:80, overflow:"hidden" }}>
            <div style={{ position:"relative", width:"100%", height:"100%" }}>
              {stairs.slice(Math.max(0,currentStep-3), currentStep+8).map(stair=>{
                const rel=stair.id-currentStep;
                const y=50-rel*12;
                const x=stair.direction==="left"?15:55;
                const isNext=stair.id===currentStep;
                const isPast=stair.id<currentStep;
                const isCharStair=stair.id===currentStep-1;
                return (
                  <div key={stair.id} style={{ position:"absolute", left:`${x}%`, top:`${y}%`, width:"36%", height:28, transition:"all 0.2s ease-out", opacity:isPast?0.25:1 }}>
                    <div style={{ position:"absolute", bottom:-4, left:2, right:-2, height:8, background:COLORS.stairShadow }} />
                    <div style={{ width:"100%", height:"100%", background:isNext?`linear-gradient(180deg, ${COLORS.accent}, ${COLORS.stairLeft})`:`linear-gradient(180deg, ${COLORS.stairRight}, ${COLORS.stairLeft})`, border:isNext?`2px solid ${COLORS.accent}`:`2px solid ${COLORS.stairShadow}`, boxShadow:isNext?`0 0 12px ${COLORS.accent}44`:"none", display:"flex", alignItems:"center", justifyContent:"center" }}>
                      <div style={{ width:"80%", height:2, background:`${COLORS.stairShadow}66` }} />
                    </div>
                    {isNext && <div style={{ position:"absolute", top:-10, left:"50%", transform:"translateX(-50%)", fontSize:10, color:COLORS.accent, animation:"pulse 0.8s infinite" }}>{stair.direction==="left"?"◀":"▶"}</div>}
                    {isCharStair && !fallAnim && <div style={{ position:"absolute", top:-38, left:"50%", transform:"translateX(-50%)" }}><PixelCharacter direction={direction} isJumping={isJumping} isStumble={isStumble} /></div>}
                  </div>
                );
              })}
              {currentStep===0 && !fallAnim && <div style={{ position:"absolute", left:"35%", top:"60%", transform:"translateX(-50%)" }}><PixelCharacter direction={direction} isJumping={isJumping} isStumble={isStumble} /></div>}
              {fallAnim && <div style={{ position:"absolute", left:"40%", top:"40%", animation:"fallDown 0.8s ease-in forwards", zIndex:30 }}><PixelCharacter direction={direction} isJumping={false} isStumble={true} /></div>}
              {particles.map(p=><div key={p.id} style={{ position:"absolute", left:p.x, top:p.y, fontSize:14, animation:"fadeParticle 0.8s ease-out forwards", pointerEvents:"none" }}>{p.emoji}</div>)}
              {currentStep>=TOTAL_STEPS && (
                <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.5)", animation:"bounceIn 0.5s ease-out" }}>
                  <div style={{ fontSize:64 }}>🎉</div>
                  <div style={{ fontSize:16, color:COLORS.accent, textShadow:"2px 2px 0 #000" }}>정상 도착!</div>
                </div>
              )}
            </div>
          </div>

          <div style={{ position:"absolute", bottom:0, left:0, right:0, height:80, display:"flex", zIndex:20 }}>
            <button
              onPointerDown={e=>{e.preventDefault();e.currentTarget.style.background="rgba(255,215,0,0.35)";handleStep("left");}}
              onPointerUp={e=>{e.currentTarget.style.background="rgba(255,215,0,0.15)"}}
              onPointerLeave={e=>{e.currentTarget.style.background="rgba(255,215,0,0.15)"}}
              style={{ flex:1, background:"rgba(255,215,0,0.15)", border:"none", borderRight:"1px solid rgba(255,215,0,0.2)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, color:COLORS.accent, fontFamily:FONT_PIXEL, fontSize:14, transition:"background 0.1s", touchAction:"manipulation" }}>
              ◀ 왼쪽
            </button>
            <button
              onPointerDown={e=>{e.preventDefault();e.currentTarget.style.background="rgba(255,107,53,0.35)";handleStep("right");}}
              onPointerUp={e=>{e.currentTarget.style.background="rgba(255,107,53,0.15)"}}
              onPointerLeave={e=>{e.currentTarget.style.background="rgba(255,107,53,0.15)"}}
              style={{ flex:1, background:"rgba(255,107,53,0.15)", border:"none", borderLeft:"1px solid rgba(255,107,53,0.2)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, color:COLORS.character, fontFamily:FONT_PIXEL, fontSize:14, transition:"background 0.1s", touchAction:"manipulation" }}>
              오른쪽 ▶
            </button>
          </div>

          {combo>=10 && <div style={{ position:"absolute", top:"45%", left:"50%", transform:"translate(-50%,-50%)", fontSize:10, color:COLORS.certAccent, textShadow:"2px 2px 0 #000", animation:"bounceIn 0.3s ease-out", pointerEvents:"none", zIndex:25 }}>🔥 {combo} COMBO! 🔥</div>}
        </div>
      )}

      {/* GAME OVER */}
      {screen==="gameover" && (
        <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:20, padding:30, zIndex:10, background:"rgba(0,0,0,0.7)" }}>
          <div style={{ animation:"bounceIn 0.4s ease-out", textAlign:"center" }}>
            <div style={{ fontSize:56 }}>😵</div>
            <h2 style={{ fontSize:16, color:COLORS.certAccent, textShadow:"2px 2px 0 #000", margin:"12px 0" }}>추락!</h2>
            <p style={{ fontSize:9, color:"#ccc", lineHeight:2 }}>{nickname}님이 발을 헛디뎠습니다...<br/>해발 {altitude}m에서 추락!</p>
          </div>
          <div style={{ fontSize:9, color:COLORS.accent }}>{currentStep}/{TOTAL_STEPS} 스텝 | 최대 콤보 x{maxCombo}</div>
          <button onClick={()=>{sfx.playUI();resetGame();setScreen("playing");}} style={{ ...btnStyle(COLORS.character,"#fff"), fontSize:12, animation:"pulse 1.5s infinite" }}>🥾 다시 도전!</button>
          <button onClick={()=>{sfx.playUI();setScreen("intro");}} style={{ ...btnStyle("transparent","#888"), fontSize:9, padding:"10px 20px", boxShadow:"none", border:"2px solid #555" }}>처음으로</button>
        </div>
      )}

      {/* WISH */}
      {screen==="wish" && (
        <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:24, padding:30, zIndex:10, background:"rgba(0,0,0,0.4)" }}>
          <div style={{ animation:"bounceIn 0.5s ease-out", textAlign:"center" }}>
            <div style={{ fontSize:56 }}>🙏</div>
            <h2 style={{ fontSize:16, color:COLORS.accent, textShadow:"2px 2px 0 #000", margin:"12px 0" }}>정상 도착!</h2>
            <p style={{ fontSize:8, color:"#ccc", lineHeight:2 }}>{nickname}님, 축하합니다!<br/>관악산 정상에서 소원을 빌어보세요 ✨</p>
          </div>
          <div style={{ fontSize:9, color:COLORS.character }}>⏱️ {formatTime(timeSec)} | 최대 콤보 x{maxCombo} | ❤️ {lives}개 남음</div>
          <div style={{ width:"100%", maxWidth:280 }}>
            <input type="text" value={wish} onChange={e=>setWish(e.target.value.slice(0,20))} onKeyDown={e=>e.key==="Enter"&&(sfx.playUI(),setScreen("certificate"))} placeholder="소원을 적어주세요..." maxLength={20}
              style={{ width:"100%", padding:"12px 16px", fontFamily:FONT_PIXEL, fontSize:11, background:"rgba(0,0,0,0.6)", border:`3px solid ${COLORS.accent}`, borderRadius:0, color:"#fff", outline:"none", boxShadow:`3px 3px 0px ${COLORS.accentDark}`, textAlign:"center" }} />
          </div>
          <button onClick={()=>{sfx.playUI();setScreen("certificate");}} style={{ ...btnStyle(COLORS.certAccent,"#fff"), fontSize:12 }}>✨ 완료증 받기</button>
        </div>
      )}

      {/* CERTIFICATE + GUESTBOOK */}
      {screen==="certificate" && (
        <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", gap:16, padding:20, zIndex:10, background:"rgba(0,0,0,0.6)", overflowY:"auto" }}>
          <div style={{ animation:"slideUp 0.5s ease-out", textAlign:"center", marginTop:12 }}>
            <div style={{ fontSize:10, color:COLORS.accent, marginBottom:8 }}>🏔️ 등산 완료증 🏔️</div>
          </div>
          <Certificate nickname={nickname} wish={wish} canvasRef={certCanvasRef} onReady={()=>setCertReady(true)} timeSec={timeSec} maxCombo={maxCombo} lives={lives} />
          {certReady && <button onClick={handleCertDownload} style={btnStyle("#FFD700","#222")}>📥 완료증 다운로드</button>}
          <Guestbook nickname={nickname} wish={wish} timeSec={timeSec} maxCombo={maxCombo} lives={lives} />
          <button onClick={()=>{sfx.playUI();setScreen("intro");resetGame();}} style={{ ...btnStyle("transparent",COLORS.accent), fontSize:9, padding:"10px 20px" }}>🔄 다시 등산</button>
          <div style={{ fontSize:7, color:"#555", marginTop:4, marginBottom:16 }}>횃불이유괴단 © 2025 🔥</div>
        </div>
      )}

      {/* RANKING */}
      {screen==="ranking" && <Ranking onBack={()=>setScreen("intro")} />}
    </div>
  );
}
