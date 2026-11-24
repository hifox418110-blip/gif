'use strict';
const el = id => document.getElementById(id);
const node = (tag, cls, value) => {
  const item = document.createElement(tag);
  if (cls) item.className = cls;
  if (value !== undefined) item.textContent = value;
  return item;
};
const toolsList = [
  ['Resize','크기 조절','⤢'], ['Crop','비율 자르기','▣'], ['Downsizing','용량 줄이기','⇲'],
  ['Format Convert','형식 변환','⇄'], ['Rotate','회전·반전','⟳'], ['Optimize','무손실 최적화','◇'],
  ['Reverse','역재생','↶'], ['Speed','재생 속도','◷'], ['Cut','구간 자르기','✂'],
  ['Boomerang','왕복 재생','↔']
];
const state = {mode:'edit', original:null, result:null, sources:[], handle:null, name:'', busy:false};
let urls = [];
const objectURL = blob => {const url=URL.createObjectURL(blob); urls.push(url); return url;};
const nextPaint = () => new Promise(resolve => setTimeout(resolve,32));
const kb = bytes => bytes < 1048576 ? (bytes/1024).toFixed(1)+' KB' : (bytes/1048576).toFixed(2)+' MB';
const seconds = n => (n/1000).toFixed(2)+'초';
function message(text, error=false) {
  const box=el('notice'); box.textContent=text; box.hidden=!text;
  box.classList.toggle('error',error); box.setAttribute('role',error?'alert':'status');
}
function btn(label,action,cls='secondary') {
  const b=node('button',cls,label); b.type='button'; b.onclick=action; return b;
}
function checkSize(w,h,n) {
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||Math.max(w,h)>8192||w*h*n>40000000)
    throw new Error('이미지가 작업 메모리 한도를 넘습니다. 크기나 프레임 수를 줄여 주세요.');
}
function surface(w,h) {
  const c=document.createElement('canvas'); c.width=w;c.height=h;return c;
}
function imageSurface(image) {
  const c=surface(image.width,image.height); c.getContext('2d').putImageData(image,0,0);return c;
}
async function job(label,fn) {
  if(state.busy)return;
  state.busy=true; document.body.setAttribute('aria-busy','true');
  message(label);await nextPaint();
  try{await fn();}catch(e){message(e.message||'처리 중 문제가 발생했습니다.',true);}
  finally{state.busy=false; document.body.removeAttribute('aria-busy');}
}
function release() {
  urls.forEach(URL.revokeObjectURL);urls=[]; state.original=null;state.result=null;state.sources=[];state.handle=null;
  for(const id of ['original-preview','result-preview','generator-settings','original-meta','result-meta'])el(id).replaceChildren();
  el('result-panel').hidden=true;el('file-input').value='';
}
function home(mode) {
  if(state.busy)return;release();state.mode=mode;
  const create=mode==='create';el('workspace').hidden=true;el('landing').hidden=false;
  el('tab-edit').setAttribute('aria-selected',String(!create));el('tab-create').setAttribute('aria-selected',String(create));
  el('hero-title').textContent=create?'스마트 GIF 생성기':'쓰기 쉬운 GIF 편집기';
  el('hero-subtitle').textContent=create?'여러 장의 사진을 하나의 GIF로 만들기':'GIF 파일을 간편히 편집하기';
  el('file-input').multiple=create;el('file-input').accept=create?'image/png,image/jpeg,image/webp':'image/gif';
  el('upload-title').textContent=create?'사진을 여기에 놓으세요':'GIF 파일을 여기에 놓으세요';
  el('upload-help').textContent=create?'PNG, JPG, WEBP · 여러 장 선택 가능':'GIF · 한 번에 한 파일';
  el('choose-file').textContent=create?'사진 선택':'GIF 파일 선택'; el('try-sample').hidden=create;
  message('');
}
function showMedia(id,blob) {
  const media=node(blob.type==='video/mp4'?'video':'img','preview-media');
  media.src=objectURL(blob);if(media.tagName==='VIDEO'){media.controls=true;media.loop=true;media.playsInline=true;}
  else media.alt=id==='original-preview'?'원본 미리보기':'편집 결과 미리보기';
  el(id).replaceChildren(media);
}
function meta(id,items) {
  el(id).replaceChildren(...items.map(([label,value])=>{
    const box=node('dl','meta-pair');box.append(node('dt','',label),node('dd','',value));return box;
  }));
}
function gifMeta(blob,doc,name) {
  return [['파일명',name],['크기',doc.width+' × '+doc.height+' px'],['프레임',doc.frames.length+'장'],
    ['재생 시간',seconds(doc.frames.reduce((s,f)=>s+f.delay,0))],['파일 용량',kb(blob.size)]];
}
function start(doc,blob,name) {
  state.original={doc,blob};state.name=name; state.mode='edit';
  document.querySelector('#original-panel summary span').textContent='Original GIF';
  el('landing').hidden=true;el('workspace').hidden=false;el('original-panel').open=true;
  el('result-panel').hidden=true;el('generator-settings').hidden=true;
  el('tab-edit').setAttribute('aria-selected','true');el('tab-create').setAttribute('aria-selected','false');
  showMedia('original-preview',blob);meta('original-meta',gifMeta(blob,doc,name));grid();message('');
}
async function openFiles(list,handle=null) {
  const files=Array.from(list);if(!files.length)return;
  return job('파일을 읽고 있어요…',async()=>{
    if(state.mode==='create'){await addPhotos(files);return;}
    if(files.length!==1)throw Error('편집할 GIF 파일 한 개만 선택해 주세요.');
    const f=files[0];
    if(f.size>48000000)throw Error('48 MB 이하의 GIF를 선택해 주세요.');
    const bytes=await f.arrayBuffer();
    if(!/^GIF8[79]a$/.test(String.fromCharCode(...new Uint8Array(bytes,0,Math.min(6,bytes.byteLength)))))
      throw Error('편집기에서는 GIF만 열 수 있어요. 사진은 GIF 생성기에서 선택해 주세요.');
    const doc=GifCodec.decode(bytes);checkSize(doc.width,doc.height,doc.frames.length);
    release();state.handle=handle;start(doc,new Blob([bytes],{type:'image/gif'}),f.name);
  });
}
async function choose() {
  if(state.busy)return;
  if(state.mode==='edit' && window.showOpenFilePicker && window.isSecureContext){
    try{
      const [h]=await window.showOpenFilePicker({id:'gif-studio',multiple:false,types:[{description:'GIF 애니메이션',accept:{'image/gif':['.gif']}}]});
      await openFiles([await h.getFile()],h);return;
    }catch(e){if(e.name==='AbortError')return;}
  }
  el('file-input').click();
}
function grid() {
  el('tool-title').textContent='Editor Tools';el('tool-grid').hidden=false;el('tool-panel').hidden=true;
  el('generator-settings').hidden=true;
  el('tool-grid').replaceChildren(...toolsList.map(([name,kr,icon])=>{
    const b=btn('',()=>{if(!state.busy)detail(name);},'tool-button');
    b.append(node('span','tool-icon',icon),node('strong','',name),node('small','',kr));return b;
  }));
}
function field(parent,label,type,config={}) {
  const row=node('label','form-field'),title=node('span','',label);
  const input=node(type==='select'?'select':'input');
  if(type==='select'){for(const [v,t] of config.options)input.add(new Option(t,v));}
  else input.type=type;
  Object.entries(config).filter(([k])=>k!=='options').forEach(([k,v])=>input[k]=v);
  row.append(title,input);parent.append(row);return input;
}
function flag(parent,label,checked) {
  const row=node('label','check-field'), input=node('input');input.type='checkbox';input.checked=checked;
  row.append(input,document.createTextNode(label));parent.append(row);return input;
}
function range(parent,label,min,max,value,step,suffix) {
  const input=field(parent,label,'range',{min,max,step,value});const title=input.previousElementSibling;
  const update=()=>title.textContent=label+' · '+input.value+suffix;update();input.addEventListener('input',update);
  return {input,update};
}
const base=()=>state.result?.doc?state.result:(state.result?.input || state.original);
function detail(name) {
  const {doc}=base(),{width:w,height:h,frames}=doc;
  const p=el('tool-panel');p.replaceChildren();p.hidden=false;el('tool-grid').hidden=true;el('tool-title').textContent=name;
  const options={};
  if(name==='Resize'){
    const x=range(p,'가로',Math.max(1,Math.round(w*.05)),w*3,w,1,' px');
    const lock=btn('🔒 비율 고정',()=>{locked=!locked;lock.textContent=locked?'🔒 비율 고정':'🔓 자유 조절';lock.setAttribute('aria-pressed',locked);},'secondary');let locked=true;
    lock.setAttribute('aria-pressed','true');p.append(lock);
    const y=range(p,'세로',Math.max(1,Math.round(h*.05)),h*3,h,1,' px');
    const sync=(a,b,ratio)=>{if(locked){b.input.value=Math.round(a.input.value*ratio);b.update();}};
    x.input.addEventListener('input',()=>sync(x,y,h/w));y.input.addEventListener('input',()=>sync(y,x,w/h));
    Object.assign(options,{w:x.input,h:y.input});
  }else if(name==='Crop'){
    options.ratio=field(p,'출력 비율','select',{options:[['1','1 : 1'],[16/9,'16 : 9'],[9/16,'9 : 16'],[4/3,'4 : 3']]});
    options.layout=field(p,'화면 맞춤','select',{options:[['cover','확대해서 빈 공간 채우기'],['contain','전체 표시 + 단색 여백']]});
    options.color=field(p,'여백 색상','color',{value:'#eef7eb'});options.color.parentElement.hidden=true;
    options.layout.onchange=()=>options.color.parentElement.hidden=options.layout.value!=='contain';
  }else if(name==='Downsizing'){
    options.shrink=flag(p,'가로·세로 크기 75%로 축소',true);options.skip=flag(p,'프레임 한 장씩 건너뛰기',false);
    options.res=flag(p,'표시 크기를 유지하며 내부 해상도 절반으로 낮추기',false);
  }else if(name==='Format Convert'){
    options.format=field(p,'저장 형식','select',{options:[['jpg','JPG · 선택한 프레임'],['mp4','MP4 · 전체 애니메이션']]});
    options.frame=range(p,'저장할 프레임',1,frames.length,1,1,'').input;
    options.format.onchange=()=>options.frame.parentElement.hidden=options.format.value==='mp4';
  }else if(name==='Rotate'){
    options.angle=field(p,'방향','select',{options:[['90','시계 방향 90°'],['180','180°'],['270','시계 방향 270°'],['flipX','좌우 반전'],['flipY','상하 반전']]});
  }else if(name==='Speed'){
    options.speed=range(p,'재생 배속',0.25,4,1,0.25,'×').input;
  }else if(name==='Boomerang'){
    const count=frames.length;
    p.append(node('p','',count<2?'한 장짜리 GIF는 그대로 반복됩니다.':'정방향 뒤에 양 끝을 제외한 역방향 프레임을 붙여 반복합니다.'));
    p.append(node('p','',count+'프레임 → '+(count+Math.max(0,count-2))+'프레임'));
  }else if(name==='Cut'){
    options.from=range(p,'시작 프레임',1,frames.length,1,1,'').input;
    options.to=range(p,'마지막 프레임',1,frames.length,frames.length,1,'').input;
  }else p.append(node('p','',name==='Reverse'?'마지막 프레임부터 거꾸로 재생합니다.':'표시되는 프레임과 재생시간을 유지하면서 파일 구조를 최적화합니다.'));
  const actions=node('div','tool-actions');actions.append(btn('Back',()=>{if(!state.busy)grid();}),btn('Go!',()=>job('편집 중…',()=>apply(name,options)),'primary'));p.append(actions);
}
function drawFrames(doc,w,h,paint,source=doc.frames){
  checkSize(w,h,source.length);const out=surface(w,h),g=out.getContext('2d',{willReadFrequently:true});
  return source.map((f,i)=>{g.save();g.clearRect(0,0,w,h);paint(g,imageSurface(f.image),i);g.restore();
    return {image:g.getImageData(0,0,w,h),delay:f.delay};});
}
async function apply(name,o){
  const original=base(), d=original.doc;let {width:w,height:h}=d, fs=d.frames.slice(),blob,ext='gif',edited;
  const scale=(ww,hh)=>{fs=drawFrames(d,ww,hh,(g,im)=>g.drawImage(im,0,0,ww,hh),fs);w=ww;h=hh;};
  if(name==='Resize'){scale(+o.w.value,+o.h.value);}
  if(name==='Crop'){
    const r=+o.ratio.value,ww=Math.max(1,Math.min(w,Math.round(h*r))),hh=Math.max(1,Math.round(ww/r));
    const cover=o.layout.value==='cover', k=(cover?Math.max:Math.min)(ww/w,hh/h);
    fs=drawFrames(d,ww,hh,(g,im)=>{if(!cover){g.fillStyle=o.color.value;g.fillRect(0,0,ww,hh);}g.drawImage(im,(ww-w*k)/2,(hh-h*k)/2,w*k,h*k);});w=ww;h=hh;
  }
  if(name==='Rotate'){
    const a=o.angle.value,swap=a==='90'||a==='270',ww=swap?h:w,hh=swap?w:h;
    fs=drawFrames(d,ww,hh,(g,im)=>{g.translate(ww/2,hh/2);if(a==='flipX')g.scale(-1,1);else if(a==='flipY')g.scale(1,-1);else g.rotate(Number(a)*Math.PI/180);g.drawImage(im,-w/2,-h/2);});w=ww;h=hh;
  }
  if(name==='Downsizing'){
    if(![o.shrink,o.skip,o.res].some(v=>v.checked))throw Error('축소할 방법을 하나 이상 선택해 주세요.');
    if(o.skip.checked)fs=fs.filter((_,i)=>i%2===0).map((f,i)=>({...f,delay:f.delay+(d.frames[i*2+1]?.delay||0)}));
    if(o.shrink.checked)scale(Math.max(1,Math.round(w*.75)),Math.max(1,Math.round(h*.75)));
    if(o.res.checked){
      const tiny=surface(Math.max(1,Math.round(w/2)),Math.max(1,Math.round(h/2))),tc=tiny.getContext('2d');
      fs=drawFrames(d,w,h,(g,im)=>{tc.clearRect(0,0,tiny.width,tiny.height);tc.drawImage(im,0,0,tiny.width,tiny.height);g.imageSmoothingEnabled=false;g.drawImage(tiny,0,0,w,h);},fs);
    }
  }
  if(name==='Reverse')fs.reverse();
  if(name==='Boomerang'){
    checkSize(w,h,fs.length+Math.max(0,fs.length-2));
    fs=fs.concat(fs.slice(1,-1).reverse());
  }
  if(name==='Speed')fs=fs.map(f=>({...f,delay:Math.max(10,Math.min(655350,Math.round(f.delay/Number(o.speed.value)/10)*10))}));
  if(name==='Cut'){if(+o.to.value < +o.from.value)throw Error('마지막 프레임은 시작 프레임 이후여야 해요.');fs=fs.slice(+o.from.value-1,+o.to.value);}
  if(name==='Optimize'){blob=await GifCodec.optimize(await original.blob.arrayBuffer());}
  if(name==='Format Convert'){
    ext=o.format.value;
    if(ext==='jpg'){const c=surface(w,h),g=c.getContext('2d');g.fillStyle='#ffffff';g.fillRect(0,0,w,h);g.drawImage(imageSurface(fs[+o.frame.value-1].image),0,0);
      blob=await new Promise(resolve=>c.toBlob(resolve,'image/jpeg',.94));}
    else blob=await GifCodec.mp4(fs,{background:'#ffffff'});
  }
  if(!blob)blob=await GifCodec.encode(fs,{loop:name==='Boomerang'?0:d.loop});
  if(!blob?.size)throw Error('결과 파일을 생성하지 못했습니다.');
  if(ext==='gif')edited=GifCodec.decode(await blob.arrayBuffer());
  const prefixes={Resize:'Resized',Crop:'Cropped',Downsizing:'Downsized','Format Convert':'Converted',Rotate:'Rotated',Optimize:'Optimized',Reverse:'Reversed',Speed:'Speed',Cut:'Cut',Boomerang:'Boomerang'};
  const prefix=prefixes[name], stem=state.name.replace(/\.[^.]+$/,'');
  const result={doc:edited,blob,filename:prefix+'_'+stem+'.'+ext,ext,stem,input:edited?null:original};
  state.result=result;el('original-panel').open=false;el('result-panel').hidden=false;el('result-panel').open=true;
  el('result-title').textContent=prefix+' '+ext.toUpperCase();showMedia('result-preview',blob);
  const data=edited?gifMeta(blob,edited,result.filename):[['파일명',result.filename],['원본 크기',w+' × '+h+' px'],['형식',ext.toUpperCase()],['용량',kb(blob.size)]];
  meta('result-meta',data);grid();
  message(name==='Optimize'&&blob.size===original.blob.size?'이미 효율적으로 압축된 GIF입니다. 원래 용량을 유지했어요.':name==='Downsizing'?'처리 완료 · '+kb(original.blob.size)+' → '+kb(blob.size):'편집을 완료했어요.');
}
function download(blob,name){const url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
async function saveResult() {
  const r=state.result;if(!r)return;
  const suggested=r.stem+'_ed.'+r.ext;
  if(window.showSaveFilePicker && window.isSecureContext){
    try{
      const opt={suggestedName:suggested,id:'gif-studio',types:[{description:r.ext.toUpperCase(),accept:{[r.blob.type]:['.'+r.ext]}}]};
      if(state.handle)opt.startIn=state.handle;
      const h=await showSaveFilePicker(opt),out=await h.createWritable();await out.write(r.blob);await out.close();message('파일을 저장했어요.');return;
    }catch(e){if(e.name==='AbortError')return;if(e.name!=='SecurityError'&&e.name!=='TypeError'){message(e.message,true);return;}}
  }
  const chosen=prompt('저장할 파일명 · 폴더 선택은 브라우저 다운로드 설정을 따릅니다.',suggested);
  if(chosen?.trim())download(r.blob,chosen.toLowerCase().endsWith('.'+r.ext)?chosen:chosen+'.'+r.ext);
}
async function addPhotos(files) {
  const remain=files.length+state.sources.length;if(remain>100)throw Error('한 번에 최대 100장까지 선택할 수 있어요.');
  const added=[];
  try{
    for(const f of files){
      if(!['image/jpeg','image/png','image/webp'].includes(f.type))throw Error('생성기에서는 JPG, PNG, WEBP 사진을 선택해 주세요.');
      const bitmap=await createImageBitmap(f);const k=Math.min(1,1280/Math.max(bitmap.width,bitmap.height));
      const c=surface(Math.max(1,Math.round(bitmap.width*k)),Math.max(1,Math.round(bitmap.height*k)));
      if([...state.sources,...added].reduce((n,s)=>n+s.c.width*s.c.height,0)+c.width*c.height>40000000){bitmap.close();throw Error('사진의 전체 화소 수가 너무 큽니다. 사진을 나누어 추가해 주세요.');}
      c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);bitmap.close();
      added.push({name:f.name,c,thumb:c.toDataURL('image/jpeg',.65)});
    }
    state.sources.push(...added);
  }catch(e){throw e;}
  el('landing').hidden=true;el('workspace').hidden=false;el('original-panel').open=true;
  el('tool-grid').hidden=true;el('tool-panel').hidden=true;el('generator-settings').hidden=false;
  document.querySelector('#original-panel summary span').textContent='사진 순서';
  el('tool-title').textContent='생성 설정';renderPhotos();message('');
}
let photoDelay=250;
function renderPhotos(){
  const list=el('original-preview');list.replaceChildren();
  state.sources.forEach((s,i)=>{
    const r=node('div','frame-row'),im=node('img','frame-thumb');im.src=s.thumb;im.alt='';
    const move=n=>{if(state.busy)return;const j=i+n;[state.sources[i],state.sources[j]]=[state.sources[j],state.sources[i]];renderPhotos();};
    const up=btn('↑',()=>move(-1)),down=btn('↓',()=>move(1)),remove=btn('삭제',()=>{if(state.busy)return;state.sources.splice(i,1);if(state.sources.length)renderPhotos();else home('create');});
    up.disabled=i===0;down.disabled=i===state.sources.length-1;up.ariaLabel='앞으로 이동';down.ariaLabel='뒤로 이동';
    r.append(im,node('span','',s.name),up,down,remove);list.append(r);
  });
  meta('original-meta',[['선택한 사진',state.sources.length+'장']]);
  const p=el('generator-settings');p.replaceChildren();
  const speed=range(p,'프레임 표시 시간',50,2000,photoDelay,10,' ms');speed.input.oninput=()=>photoDelay=Number(speed.input.value);
  p.append(node('p','','첫 사진의 비율에 맞춰 전체 사진을 배치합니다. 긴 변은 최대 1280 px입니다.'));
  p.append(btn('사진 추가',()=>el('file-input').click()),btn('GIF 만들기',()=>job('GIF를 만들고 있어요…',async()=>{
    const {width:w,height:h}=state.sources[0].c;checkSize(w,h,state.sources.length);const dest=surface(w,h),g=dest.getContext('2d',{willReadFrequently:true});
    const frames=state.sources.map(({c})=>{const k=Math.min(w/c.width,h/c.height);g.fillStyle='#ffffff';g.fillRect(0,0,w,h);g.drawImage(c,(w-c.width*k)/2,(h-c.height*k)/2,c.width*k,c.height*k);return {image:g.getImageData(0,0,w,h),delay:photoDelay};});
    const blob=await GifCodec.encode(frames,{loop:0}),stem=state.sources[0].name.replace(/\.[^.]+$/,'');
    const d=GifCodec.decode(await blob.arrayBuffer());release();start(d,blob,stem+'.gif');
    state.result={blob,doc:d,filename:stem+'.gif',stem,ext:'gif'};el('result-panel').hidden=false;el('result-panel').open=true;el('original-panel').open=false;
    el('result-title').textContent='생성한 GIF';showMedia('result-preview',blob);meta('result-meta',gifMeta(blob,d,stem+'.gif'));message('GIF를 만들었어요. 다운로드하거나 편집을 이어가세요.');
  }),'primary'));
}
async function sample(){
  await job('예제 GIF를 여는 중…',async()=>{
    const c=surface(240,160),g=c.getContext('2d',{willReadFrequently:true}),frames=[];
    for(let i=0;i<16;i++){
      g.fillStyle='#123d3b';g.fillRect(0,0,240,160);
      for(let j=0;j<5;j++){let x=44+j*39,y=80+Math.sin(i*Math.PI/8+j*.9)*27;
        g.beginPath();g.arc(x,y,13,0,2*Math.PI);g.fillStyle=['#c3f576','#89dbc3','#ffd489','#e8f9e0','#89dbc3'][j];g.fill();}
      frames.push({image:g.getImageData(0,0,240,160),delay:80});
    }
    const blob=await GifCodec.encode(frames,{loop:0});release();start(GifCodec.decode(await blob.arrayBuffer()),blob,'wave.gif');
  });
}
el('tab-edit').onclick=()=>home('edit');el('tab-create').onclick=()=>home('create');
el('new-file').onclick=()=>home(state.mode);el('choose-file').onclick=e=>{e.stopPropagation();choose();};
el('try-sample').onclick=e=>{e.stopPropagation();sample();};
el('file-input').onchange=e=>{openFiles(e.target.files);e.target.value='';};
const zone=el('dropzone');
zone.ondragover=e=>{e.preventDefault();zone.classList.add('dragging');};
zone.ondragleave=()=>zone.classList.remove('dragging');
zone.ondrop=e=>{e.preventDefault();zone.classList.remove('dragging');const f=Array.from(e.dataTransfer.files);
  if(state.mode==='edit'&&f.length===1&&e.dataTransfer.items[0]?.getAsFileSystemHandle){e.dataTransfer.items[0].getAsFileSystemHandle().then(h=>openFiles(f,h),()=>openFiles(f));}else openFiles(f);};
el('download-result').onclick=()=>{if(state.result)download(state.result.blob,state.result.filename);};
el('save-result').onclick=saveResult;home('edit');
