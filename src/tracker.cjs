const {spawn} = require('node:child_process');
const path = require('node:path');
const readline = require('node:readline');
const {EventEmitter} = require('node:events');
const {isInside,BAD_EXE} = require('./scanner.cjs');
const {randomUUID} = require('node:crypto');
function dayKey(date) { const d=new Date(date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function splitDays(start,end) {
  const out={}; let cursor=start;
  while(cursor<end) { const d=new Date(cursor); d.setHours(24,0,0,0); const next=Math.min(end,d.getTime()); const key=dayKey(cursor); out[key]=(out[key]||0)+(next-cursor)/1000; cursor=next; }
  return out;
}
class Tracker extends EventEmitter {
  constructor(store) {super();this.store=store;this.active=new Map();this.processes=[];this.lastPacket=0;this.health='starting';this.stopped=false;}
  start() {
    this.worker=spawn(require('./windows.cjs').powershellPath(),['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'processes.ps1'),'-OwnerPid',String(process.pid)],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    const lines=readline.createInterface({input:this.worker.stdout});
    lines.on('line',line=>{try{this.tick(JSON.parse(line));}catch(e){this.emit('warning',e.message);}});
    this.worker.on('error',e=>{this.health='error';this.emit('warning',e.message);});
    this.worker.on('exit',()=>{if(!this.stopped){this.health='error';this.emit('warning','进程监控已断开，正在重新连接');this.restart=setTimeout(()=>this.start(),4000);}});
  }
  recover() {
    for(const s of this.store.state.sessions.filter(s=>!s.endedAt)) {
      const game=this.store.state.games.find(g=>g.id===s.gameId);
      const live=game && this.processes.some(p=>this.matches(game,s,p));
      if(live) this.active.set(s.gameId,{session:s,game,lastSeen:Date.now(),seen:true,windowSeen:!!s.windowSeen,recovered:true});
      else {s.endedAt=s.checkpoint||s.startedAt;s.interrupted=true;}
    }
    // A launcher update/restart may happen while the game remains open.
    for(const s of [...this.store.state.sessions].reverse()){
      if(s.reason!=='launcher-quit'||!s.endedAt||Date.now()-new Date(s.endedAt).getTime()>30000||this.active.has(s.gameId))continue;
      const game=this.store.state.games.find(g=>g.id===s.gameId),p=game&&this.processes.find(p=>this.matches(game,s,p));
      if(p){const next=this.begin(game,p.id,[],s.emulatorPath);next.pidStarted=p.started;next.resumedAfterRestart=true;}
    }
    this.store.save();
  }
  matches(game,s,p) {
    if (s.launchPid===p.id && Math.abs((s.pidStarted||p.started)-p.started)<1000) return true;
    if (s.emulatorPath && p.path.toLowerCase()===s.emulatorPath.toLowerCase() && p.started>=new Date(s.startedAt).getTime()-5000) return true;
    return isInside(game.folder,p.path) && !BAD_EXE.test(path.basename(p.path)) && !(s.baseline||[]).includes(p.id) && p.started>=new Date(s.startedAt).getTime()-5000;
  }
  tick(packet) {
    const oldHealth=this.health;
    const now=packet.at || Date.now();const dt=this.lastPacket && now-this.lastPacket>0 && now-this.lastPacket<8000 ? (now-this.lastPacket)/1000 : 0;
    const previous=this.processes; this.processes=packet.processes||[]; this.lastPacket=now;this.health='ok';
    if(!this.recovered){this.recovered=true;this.recover();}
    let changed=false;
    for(const [id,run] of this.active) {
      const alive=this.processes.some(p=>this.matches(run.game,run.session,p));
      const visible=this.processes.some(p=>this.matches(run.game,run.session,p)&&p.hasWindow===true);
      if(visible){if(!run.windowSeen){run.game.lastPlayed=run.session.startedAt;if(run.game.status==='unplayed')run.game.status='playing';}run.windowSeen=true;run.session.windowSeen=true;run.game.lastLaunchIssue=null;}
      if(alive&&!run.windowSeen&&!run.warnedWindow&&now-new Date(run.session.startedAt).getTime()>20000){run.warnedWindow=true;run.game.lastLaunchIssue={kind:'no-window',message:'游戏进程已运行，但未检测到可见窗口。请检查转区设置、游戏自身提示或运行库。',at:new Date(now).toISOString()};this.store.save();this.emit('warning',run.game.lastLaunchIssue.message);}
      const wasAlive=previous.some(p=>this.matches(run.game,run.session,p));
      if(alive) {run.lastSeen=now;run.seen=true; const p=this.processes.find(p=>p.id===run.session.launchPid);if(p)run.session.pidStarted=p.started;}
      if(alive && wasAlive && dt>0 && !run.session.paused) {
        const effectiveStart=Math.max(now-dt*1000,new Date(run.session.startedAt).getTime());
        const seconds=(now-effectiveStart)/1000;
        run.session.seconds+=seconds;run.game.playSeconds=(run.game.playSeconds||0)+seconds;
        for(const [day,s] of Object.entries(splitDays(effectiveStart,now))) run.session.days[day]=(run.session.days[day]||0)+s;
        changed=true;
      }
      run.session.checkpoint=new Date(now).toISOString();
      // A short grace period catches launchers handing control to the real game.
      if(!alive && now-run.lastSeen>(run.seen?6000:20000)) {this.finish(id,run.seen?'closed':'not-detected');changed=true;}
    }
    if(this.active.size && (!this.lastSave || now-this.lastSave>=10000)) { this.store.save();this.lastSave=now; }
    if(changed||this.active.size||oldHealth!==this.health)this.emit('update');
  }
  begin(game,pid,baseline,emulatorPath) {
    const now=new Date().toISOString();const s={id:randomUUID(),gameId:game.id,startedAt:now,checkpoint:now,endedAt:null,seconds:0,days:{},launchPid:pid,baseline,emulatorPath:emulatorPath||null,paused:false};
    game.lastLaunchAt=now;
    this.store.state.sessions.push(s);this.active.set(game.id,{session:s,game,lastSeen:Date.now(),seen:false});this.store.save();this.emit('update');return s;
  }
  pause(id) {const r=this.active.get(id);if(!r)throw new Error('游戏当前没有计时');r.session.paused=!r.session.paused;this.store.save();this.emit('update');}
  finish(id,reason='manual') {const r=this.active.get(id);if(!r)return;r.session.endedAt=r.session.checkpoint||new Date().toISOString();r.session.reason=reason;if(reason==='not-detected'){r.game.lastLaunchIssue={kind:'not-detected',message:'启动请求已发送，但没有检测到实际游戏进程。请检查启动程序、LE 配置或游戏依赖。',at:r.session.endedAt};this.emit('warning',r.game.lastLaunchIssue.message);}this.active.delete(id);this.store.save();this.emit('update');}
  stop() {this.stopped=true;clearTimeout(this.restart);this.worker?.kill();for(const id of this.active.keys())this.finish(id,'launcher-quit');}
  list(){return [...this.active.entries()].map(([gameId,r])=>({gameId,sessionId:r.session.id,seconds:r.session.seconds,paused:r.session.paused,startedAt:r.session.startedAt,seen:r.seen,windowSeen:!!r.windowSeen,phase:r.windowSeen?'running':r.warnedWindow?'no-window':'starting'}));}
}
module.exports={Tracker,dayKey,splitDays};
