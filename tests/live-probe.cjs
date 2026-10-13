if (!process.env.PROBE_HOST) throw new Error('Set PROBE_HOST to an authorized test server');
// Synthetic clients send only an Opus silence frame. Never accesses a microphone.
const mc = require('minecraft-protocol');
const crypto = require('node:crypto');
const dgram = require('node:dgram');
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const host = process.env.PROBE_HOST;
const clients = [];
const vi = n => { const a=[]; do { let b=n&127;n>>>=7;a.push(b|(n?128:0)); } while(n);return Buffer.from(a); };
function readVi(b, offset) { let v=0,s=0; do {const x=b[offset++];v|=(x&127)<<s;if(!(x&128))return [v,offset];s+=7;}while(s<35);throw Error('VarInt'); }
function probe(name) {
 const c=mc.createClient({host,port:25565,username:name,auth:'offline',version:'1.20.1'});
 const socket=dgram.createSocket('udp4');
 const p={c,socket,connected:false,frames:[],secret:null,uuid:null}; clients.push(p);
 p.send=(plain,key=p.secret)=>{const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-128-gcm',key,iv);const enc=Buffer.concat([iv,cipher.update(plain),cipher.final(),cipher.getAuthTag()]);socket.send(Buffer.concat([Buffer.from([255]),p.uuid,vi(enc.length),enc]),24454,host);};
 socket.on('message',data=>{try {assert.equal(data[0],255);const [len,o]=readVi(data,1);const enc=data.subarray(o);assert.equal(len,enc.length);const dec=crypto.createDecipheriv('aes-128-gcm',p.secret,enc.subarray(0,12));dec.setAuthTag(enc.subarray(-16));const b=Buffer.concat([dec.update(enc.subarray(12,-16)),dec.final()]);if(b[0]===6)p.send(Buffer.from([9]));if(b[0]===10)p.connected=true;if(b[0]===8)p.send(Buffer.from([8]));if(b[0]===2)p.frames.push(b); }catch(e){p.error=e;}});
 c.on('error',e=>{p.error=e;});
 c.on('end',reason=>{console.log(name,'game connection ended:',reason);});
 c.on('kick_disconnect',e=>{p.error=Error(JSON.stringify(e));});
 c.on('position',v=>c.write('teleport_confirm',{teleportId:v.teleportId}));
 c.on('custom_payload',packet=>{if(packet.channel!=='voicechat:secret')return;const b=packet.data;p.secret=b.subarray(0,16);assert.equal(b.readInt32BE(16),24454);p.uuid=b.subarray(20,36);assert.equal(b[53],0,'groups disabled');const [len,o]=readVi(b,54);assert.equal(b.subarray(o,o+len).toString(),host+':24454');assert.equal(b[o+len],0,'recording disabled');p.send(Buffer.concat([Buffer.from([5]),p.uuid,p.secret]));console.log(name, 'received voice configuration');});
 c.once('login',()=>{c.write('settings',{locale:'en_US',viewDistance:2,chatFlags:0,chatColors:true,skinParts:127,mainHand:1,enableTextFiltering:false,enableServerListing:true});p.timer=setInterval(()=>{if(!p.secret){const b=Buffer.alloc(4);b.writeInt32BE(20);c.write('custom_payload',{channel:'voicechat:request_secret',data:b});}},2000);});
 return p;
}
(async()=>{
 try {
 const a=probe('VoiceProbeA');await delay(5000);const b=probe('VoiceProbeB');
 for(let i=0;i<60&&(!a.connected||!b.connected);i++){await delay(1000);for(const p of clients)if(p.error)throw p.error;}
 assert(a.connected&&b.connected,'both clients authenticated and connected over public UDP');
 console.log('PASS: game handshake through Velocity and encrypted UDP authentication');
 const mic=Buffer.concat([Buffer.from([1,3,0xf8,0xff,0xfe]),Buffer.alloc(8),Buffer.from([0])]);
 a.send(mic,crypto.randomBytes(16));await delay(700);assert.equal(b.frames.length,0,'wrong-key audio rejected');
 a.send(mic);for(let i=0;i<10&&!b.frames.length;i++)await delay(300);
 assert(b.frames.length,'nearby receiver gets audio');const frame=b.frames[0];assert(frame.subarray(17,33).equals(a.uuid),'correct sender');assert(frame.subarray(34,37).equals(Buffer.from([0xf8,0xff,0xfe])),'silence payload preserved');
 console.log('PASS: wrong key rejected and silence frame relayed to nearby player');
 } finally { for(const p of clients){clearInterval(p.timer);p.c.end();p.c.socket?.destroy();p.socket.close();} }
})().catch(e=>{console.error(e);process.exitCode=1;});
