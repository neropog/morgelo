/* API local: IndexedDB guarda dados e Blobs, sem servidor ou dependências. */
(function () {
    'use strict';
    const MG = window.MG = window.MG || {};
    const MAX_MB = 100;
    const copy = (x) => structuredClone(x);
    const uid = (prefix) => prefix + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Date.now().toString(36) + Math.random().toString(36).slice(2));
    const urls = new Map(), refs = new Map();
    let database, current, pending = Promise.resolve();
    const ID = /^[\w-]{1,100}$/;
    const text = (x, limit=5000) => String(x == null ? '' : x).trim().slice(0,limit);
    const number = (x, fallback=0) => Number.isFinite(Number(x)) && Number(x)>=0 ? Math.round(Number(x)) : fallback;
    function safeURL(x) {
        if (!x) return null;
        const s = String(x);
        if (refs.has(s)) return refs.get(s);
        if (/^mgasset:[\w-]+$/.test(s) || /^data:(image|video)\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i.test(s)) return s;
        if (/^(https?:\/\/|\.?\.?\/)?[\w./%:@?=&+-]+$/.test(s) && !/^javascript:|^blob:|^\/\//i.test(s)) return s;
        throw new Error('Endereço de mídia inválido.');
    }
    const checkedID = (x) => { if (!ID.test(x)) throw new Error('Identificador inválido no arquivo.'); return x; };
    function cleanChannel(b, old={}) {
        b={...old,...b};
        const name=text(b.name,60);
        if (!name) throw new Error('Dê um nome ao canal.');
        return {id:b.id || uid('ch'), name, handle:text(b.handle,40)||'@'+name.toLowerCase().replace(/\s+/g,''), subs:text(b.subs,60), about:text(b.about,1000), avatar:safeURL(b.avatar), banner:safeURL(b.banner), createdAt:number(b.createdAt,Date.now())};
    }
    function cleanVideo(b, old={}) {
        b={...old,...b};
        return {id:b.id||uid(b.short?'s':'v'), title:text(b.title,120)||'Sem título', desc:text(b.desc), ch:checkedID(b.ch), cat:text(b.cat,40), type:b.type==='video'?'video':'image', media:safeURL(b.media), thumb:safeURL(b.thumb), duration:number(b.duration), views:number(b.views), likes:b.likes==null?null:number(b.likes), short:!!b.short, createdAt:number(b.createdAt,Date.now())};
    }
    function cleanComment(b, old={}) {
        b={...old,...b};
        const value=text(b.text,3000);
        if (!value) throw new Error('Comentário vazio.');
        return {id:b.id||uid('c'), target:checkedID(b.target), parent:b.parent?checkedID(b.parent):null, text:value, name:text(b.name,40)||'@voce', avatar:safeURL(b.avatar), likes:number(b.likes), createdAt:number(b.createdAt,Date.now())};
    }
    function validate(data) {
        if (!data || !['channels','videos','comments','categories'].every(k=>Array.isArray(data[k]))) throw new Error('Arquivo de conteúdo inválido. Use um backup JSON deste site.');
        const d={channels:data.channels.map(b=>({...cleanChannel(b),id:checkedID(b.id)})), videos:data.videos.map(b=>({...cleanVideo(b),id:checkedID(b.id)})), comments:data.comments.map(b=>({...cleanComment(b),id:checkedID(b.id)})),categories:[...new Set(data.categories.map(x=>text(x,40)).filter(Boolean))]};
        for(const list of [d.channels,d.videos,d.comments]) if(new Set(list.map(x=>x.id)).size!==list.length) throw new Error('Identificadores repetidos no arquivo.');
        const channels=new Set(d.channels.map(x=>x.id)), videos=new Set(d.videos.map(x=>x.id));
        if(d.videos.some(v=>!channels.has(v.ch)) || d.comments.some(c=>!videos.has(c.target))) throw new Error('Canal ou vídeo ausente no arquivo.');
        if(d.comments.some(c=>c.parent && !d.comments.some(p=>p.id===c.parent && !p.parent && p.target===c.target))) throw new Error('Resposta sem comentário correspondente.');
        return d;
    }
    function transact(stores, mode, action) {
        return new Promise((resolve,reject)=>{
            const tx=database.transaction(stores,mode); let result;
            tx.oncomplete=()=>resolve(result);
            tx.onabort=tx.onerror=()=>reject(new Error(tx.error?.name==='QuotaExceededError'?'O navegador está sem espaço. Exclua arquivos ou faça um backup.':'Não foi possível salvar no navegador. Verifique se o armazenamento está permitido.'));
            try { result=action(tx); } catch(e) { tx.abort(); reject(e); }
        });
    }
    function get(store,key) {
        return new Promise((resolve,reject)=>{
            const req=database.transaction(store).objectStore(store).get(key);
            req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
        });
    }
    function walk(value, convert) {
        if(typeof value==='string') return convert(value);
        if(Array.isArray(value)) return value.map(x=>walk(x,convert));
        if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,walk(v,convert)]));
        return value;
    }
    function hydrate(value) { return walk(copy(value),s=>urls.get(s)||s); }
    const canonical = value => walk(copy(value),s=>refs.get(s)||s);
    function remember(id,blob) {
        const url=URL.createObjectURL(blob); urls.set('mgasset:'+id,url); refs.set(url,'mgasset:'+id); return url;
    }
    const ready = (async()=>{
        if(!window.indexedDB) throw new Error('Este navegador não oferece armazenamento local. Abra no Chrome, Edge ou Firefox com armazenamento permitido.');
        database=await new Promise((resolve,reject)=>{
            const req=indexedDB.open('morgilio-static-v1',1);
            req.onupgradeneeded=()=>{ req.result.createObjectStore('state'); req.result.createObjectStore('files',{keyPath:'id'}); };
            req.onsuccess=()=>resolve(req.result);
            req.onerror=()=>reject(new Error('O armazenamento do navegador está bloqueado.'));
        });
        current=await get('state','main');
        if(!current) { current=validate(window.MG_SEED); await transact(['state'],'readwrite',tx=>tx.objectStore('state').put(current,'main')); }
        const files=await new Promise((resolve,reject)=>{
            const req=database.transaction('files').objectStore('files').getAll(); req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
        });
        files.forEach(f=>remember(f.id,f.blob));
    })();
    // Serialize mutations so a view count cannot overwrite a simultaneous upload.
    function mutate(fn) {
        const job=pending.then(async()=>{ await ready; const next=copy(current); const result=fn(next); await transact(['state'],'readwrite',tx=>tx.objectStore('state').put(next,'main')); current=next; return hydrate(result); });
        pending=job.catch(()=>{}); return job;
    }
    async function state() { await ready; await pending; return {...hydrate(current),authRequired:false,maxUploadMB:MAX_MB}; }
    function find(d,key,id) { const item=d[key].find(x=>x.id===id); if(!item) throw new Error('Item não encontrado.'); return item; }
    function replace(d,key,id,b,clean) { const old=find(d,key,id); Object.assign(old,clean({...canonical(b),id},old)); return old; }
    const fileRecords=()=>new Promise((resolve,reject)=>{ const req=database.transaction('files').objectStore('files').getAll(); req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); });
    function download(blob,name) { const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),60000); }
    const asDataURL=blob=>new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=()=>reject(new Error('Falha ao ler mídia.')); r.readAsDataURL(blob); });
    async function portable(onProgress) {
        await ready; await pending;
        const d=copy(current), used=new Set(); walk(d,s=>{ if(s.startsWith('mgasset:')) used.add(s); return s; });
        const files=await fileRecords(), dataURLs=new Map(); let done=0;
        for(const key of used) { const f=files.find(f=>'mgasset:'+f.id===key); if(!f) throw new Error('Mídia ausente.'); dataURLs.set(key,await asDataURL(f.blob)); if(onProgress) onProgress(++done/used.size); }
        return walk(d,s=>dataURLs.get(s)||s);
    }
    async function importData(data) {
        const d=validate(data);
        walk(d,s=>{if(s.startsWith('mgasset:')) throw new Error('Backup incompleto: mídia local ausente.'); return s;});
        await transact(['state','files'],'readwrite',tx=>{tx.objectStore('state').put(d,'main');tx.objectStore('files').clear();});
        current=d;
        // Keep existing object URLs alive until the interface finishes reloading.
        return {videos:d.videos.length,channels:d.channels.length,files:0};
    }
    MG.api = {
        state,
        async upload(blob,name,onProgress) {
            await ready;
            if(!(blob instanceof Blob)||!blob.size) throw new Error('Arquivo vazio.');
            if(blob.size>MAX_MB*1048576) throw new Error('Limite de '+MAX_MB+' MB por arquivo.');
            if (!blob.type) {
                const ext=String(name||blob.name||'').split('.').pop().toLowerCase();
                const types={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',avif:'image/avif',bmp:'image/bmp',mp4:'video/mp4',m4v:'video/mp4',webm:'video/webm',mov:'video/quicktime',ogv:'video/ogg',mkv:'video/x-matroska'};
                if(!types[ext]) throw new Error('Formato de mídia desconhecido.');
                blob=blob.slice(0,blob.size,types[ext]);
            }
            const id=uid('f'); if(onProgress) onProgress(0);
            await transact(['files'],'readwrite',tx=>tx.objectStore('files').put({id,name:text(name||blob.name,200),blob}));
            if(onProgress) onProgress(1); return remember(id,blob);
        },
        createChannel: b=>mutate(d=>{const c=cleanChannel(canonical(b));d.channels.push(c);return c;}),
        updateChannel: (id,b)=>mutate(d=>replace(d,'channels',id,b,cleanChannel)),
        deleteChannel: id=>mutate(d=>{find(d,'channels',id);const gone=new Set(d.videos.filter(v=>v.ch===id).map(v=>v.id));d.channels=d.channels.filter(c=>c.id!==id);d.videos=d.videos.filter(v=>!gone.has(v.id));d.comments=d.comments.filter(c=>!gone.has(c.target));return {ok:true,removedVideos:[...gone]};}),
        createVideo: b=>mutate(d=>{find(d,'channels',b.ch);const v=cleanVideo(canonical(b));d.videos.unshift(v);if(v.cat&&!d.categories.includes(v.cat))d.categories.push(v.cat);return v;}),
        updateVideo: (id,b)=>mutate(d=>{if(b.ch)find(d,'channels',b.ch);const v=replace(d,'videos',id,b,cleanVideo);if(v.cat&&!d.categories.includes(v.cat))d.categories.push(v.cat);return v;}),
        deleteVideo: id=>mutate(d=>{find(d,'videos',id);d.videos=d.videos.filter(v=>v.id!==id);d.comments=d.comments.filter(c=>c.target!==id);return {ok:true};}),
        view: id=>mutate(d=>{const v=find(d,'videos',id);v.views++;return {views:v.views};}),
        createComment: b=>mutate(d=>{find(d,'videos',b.target);const c=cleanComment(canonical(b));if(c.parent){const p=find(d,'comments',c.parent);if(p.target!==c.target)throw new Error('Resposta inválida.');c.parent=p.parent||p.id;}d.comments.push(c);return c;}),
        updateComment: (id,b)=>mutate(d=>replace(d,'comments',id,b,cleanComment)),
        deleteComment: id=>mutate(d=>{find(d,'comments',id);const removed=d.comments.filter(c=>c.id===id||c.parent===id).map(c=>c.id);d.comments=d.comments.filter(c=>!removed.includes(c.id));return {ok:true,removed};}),
        setCategories: list=>mutate(d=>{d.categories=[...new Set(list.map(x=>text(x,40)).filter(Boolean))];d.videos.forEach(v=>{if(!d.categories.includes(v.cat))v.cat='';});return {categories:d.categories};}),
        async stats() {await ready;await pending;const files=await fileRecords();return {files:files.length,bytes:files.reduce((a,f)=>a+f.blob.size,0)};},
        async cleanup() {
            await ready;await pending;
            const used=new Set();walk(current,s=>{if(s.startsWith('mgasset:'))used.add(s.slice(8));return s;});
            const unused=(await fileRecords()).filter(f=>!used.has(f.id));
            await transact(['files'],'readwrite',tx=>unused.forEach(f=>tx.objectStore('files').delete(f.id)));
            return {removed:unused.length};
        },
        async backup(onProgress) {const data=await portable(onProgress);download(new Blob([JSON.stringify({format:'morgilio-static',version:1,data})],{type:'application/json'}),'morgilio-backup.json');},
        async exportSite(onProgress) {const data=await portable(onProgress);download(new Blob(['/* Conteúdo público exportado do Studio. */\nwindow.MG_SEED = '+JSON.stringify(data,null,2)+';\n'],{type:'text/javascript'}),'seed.js');},
        restore(file,onProgress) {
            const job=pending.then(async()=>{await ready;const b=JSON.parse(await file.text());if(b.format!=='morgilio-static'||b.version!==1)throw new Error('Selecione um backup JSON deste site.');const r=await importData(b.data);if(onProgress)onProgress(1);return r;}); pending=job.catch(()=>{});return job;
        },
        resetContent() {const job=pending.then(async()=>{await ready;return importData(window.MG_SEED);});pending=job.catch(()=>{});return job;},
        async downloadMedia(v) {await ready;const key=refs.get(v.media);let name;if(key){const f=await get('files',key.slice(8));name=f?.name;}const a=document.createElement('a');a.href=v.media;a.download=name||text(v.title,80)+(v.type==='video'?'.mp4':'.png');a.click();}
    };
    /* ==========================================================
       PREPARO DE MÍDIA (tudo no navegador, antes de enviar)
       ========================================================== */
    const VIDEO_EXT = ['mp4', 'm4v', 'webm', 'mov', 'ogv', 'mkv'];
    const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp'];
    const extOf = (name) => (String(name).split('.').pop() || '').toLowerCase();

    // Reconhece as extensões de mídia compatíveis com o fluxo local
    function kindOf(file) {
        const e = extOf(file.name);
        if (VIDEO_EXT.includes(e)) return 'video';
        if (IMAGE_EXT.includes(e)) return 'image';
        return null;
    }

    function loadImage(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => { img._url = url; resolve(img); };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagem ilegível')); };
            img.src = url;
        });
    }

    function toBlob(canvas, type, quality) {
        return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
    }

    // desenha "source" num canvas com largura máxima e devolve um Blob
    async function render(source, sw, sh, maxW, type, quality) {
        const scale = Math.min(1, maxW / sw);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(sw * scale));
        c.height = Math.max(1, Math.round(sh * scale));
        const ctx = c.getContext('2d');
        if (type === 'image/jpeg') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height); }
        ctx.drawImage(source, 0, 0, c.width, c.height);
        return toBlob(c, type, quality);
    }

    // miniatura (640px, JPEG) a partir de uma foto
    async function imageThumb(file) {
        const img = await loadImage(file);
        try { return await render(img, img.naturalWidth, img.naturalHeight, 640, 'image/jpeg', 0.82); }
        finally { URL.revokeObjectURL(img._url); }
    }

    // reduz fotos grandes (máx. 1920px) — GIFs ficam como estão para não perder a animação
    async function optimizeImage(file) {
        if (extOf(file.name) === 'gif' || file.type === 'image/gif') return { blob: file, name: file.name };
        try {
            const img = await loadImage(file);
            const big = Math.max(img.naturalWidth, img.naturalHeight) > 1920;
            if (!big && file.size < 1.2 * 1024 * 1024) { URL.revokeObjectURL(img._url); return { blob: file, name: file.name }; }
            let blob = await render(img, img.naturalWidth, img.naturalHeight, 1920, 'image/webp', 0.88);
            URL.revokeObjectURL(img._url);
            let ext = 'webp';
            if (!blob || blob.type !== 'image/webp') { // navegador sem suporte a WebP no canvas
                const img2 = await loadImage(file);
                blob = await render(img2, img2.naturalWidth, img2.naturalHeight, 1920, 'image/jpeg', 0.88);
                URL.revokeObjectURL(img2._url);
                ext = 'jpg';
            }
            if (blob && blob.size < file.size) return { blob, name: file.name.replace(/\.[^.]+$/, '') + '.' + ext };
        } catch (e) { /* mantém o original */ }
        return { blob: file, name: file.name };
    }

    // lê duração e captura um quadro de um vídeo para servir de miniatura
    function videoInfo(file) {
        return new Promise((resolve) => {
            const url = URL.createObjectURL(file);
            const v = document.createElement('video');
            v.muted = true; v.playsInline = true; v.preload = 'auto';
            let done = false;
            const finish = (r) => { if (done) return; done = true; clearTimeout(timer); URL.revokeObjectURL(url); v.removeAttribute('src'); v.load(); resolve(r); };
            const timer = setTimeout(() => finish({ ok: false, duration: 0, thumb: null }), 15000);
            v.onerror = () => finish({ ok: false, duration: 0, thumb: null });
            v.onloadedmetadata = () => {
                const d = isFinite(v.duration) ? v.duration : 0;
                v._d = d;
                v.currentTime = d > 2 ? Math.min(d * 0.1, 3) : 0.01;
            };
            v.onseeked = async () => {
                try {
                    const thumb = await render(v, v.videoWidth || 640, v.videoHeight || 360, 640, 'image/jpeg', 0.82);
                    finish({ ok: true, duration: Math.round(v._d || 0), thumb, width: v.videoWidth, height: v.videoHeight });
                } catch (e) { finish({ ok: false, duration: Math.round(v._d || 0), thumb: null }); }
            };
            v.src = url;
        });
    }

    MG.media = { kindOf, extOf, imageThumb, optimizeImage, videoInfo, loadImage };
})();