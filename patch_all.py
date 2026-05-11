import re, subprocess

with open('base.html', 'rb') as f:
    html = f.read()

# === 1. SEND ICON ===
html = html.replace(
    b"b.textContent=E.speaking?'\\u25a0':'\\u2708\\ufe0f'",
    b"b.textContent=E.speaking?'\\u25a0':'\\u2191'")
html = html.replace(
    b'>\xe2\x9c\x88\xef\xb8\x8f</button>',
    b'>\xe2\x86\x91</button>')
print("1. Send icon ↑ ✓")

# === 2. RIGHT MODEL ===
old_r = b'<div class="pw" id="pwR">\n        <button class="m-btn red tip" tip="Change Model" id="btnR" onclick="toggleDropdown(event,\'R\')">Gemma3 27b \xe2\x96\xbc</button>\n        <button class="g-btn tip" tip="Settings" id="gearR" onclick="openSettings(\'R\')" style="display: inline-flex;">\xe2\x9a\x99</button>\n      </div>'
new_r = b'<div class="pw" id="pwR">\n        <button class="g-btn tip" tip="Settings" id="gearR" onclick="openSettings(\'R\')" style="display: inline-flex;">\xe2\x9a\x99</button>\n        <button class="m-btn red tip" tip="Change Model" id="btnR" onclick="toggleDropdown(event,\'R\')">\xe2\x96\xbc Gemma3 27b</button>\n      </div>'
if old_r in html:
    html = html.replace(old_r, new_r)
    print("2. Right model ✓")

# === 3. REWRITE SETTINGS ===
old_start = b'function openSettings(side){'
old_end = b'\n// \xe2\x94\x80\xe2\x94\x80 SHARE \xe2\x94\x80\xe2\x94\x80'

idx1 = html.find(old_start)
idx2 = html.find(old_end)

new_settings = b'''function openSettings(side){
  if(!GM(side))return;var isL=side==='L';var model=GM(side),sys=S[isL?'sysL':'sysR'];
  var ov=document.createElement('div');ov.className='modal-overlay';
  ov.onclick=function(e){if(e.target===ov)ov.remove();};
  var c=isL?'#4b8cf7':'#e84040';
  var nOpt='<option value="">'+t('none')+'</option>';
  MODELS.forEach(function(m){nOpt+='<option value="'+m+'"'+(m===model?' selected':'')+'>'+fmt(m)+'</option>';});
  var curAgg=A[side]||5;
  var aggHtml='<label style="margin-bottom:2px">'+t('aggression')+' <span id="aggVal_'+side+'" style="color:#aaa;font-size:11px">'+curAgg+'/10</span></label>'+
    '<input type="range" min="1" max="10" value="'+curAgg+'" id="aggSlider" style="width:100%;margin-bottom:10px;accent-color:'+c+'">';
  ov.innerHTML='<div class="modal" style="max-width:480px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><h3 style="color:'+c+'">'+t(isL?'blue':'red')+'</h3><button id="modalCloseBtn" style="background:none;border:none;color:#777;font-size:22px;cursor:pointer">\xc3\x97</button></div>'+
    '<label>'+t('mdl')+'</label><select id="setModel">'+nOpt+'</select>'+
    aggHtml+
    '<label>'+t('sp')+'</label><textarea id="setSys" rows="3" style="width:100%;padding:8px;border-radius:6px;border:1px solid #333;background:#1a1a1a;color:#e0e0e0;font-size:13px;resize:vertical;font-family:inherit;margin-bottom:6px" placeholder="'+t('spPlace')+'">'+(sys||'')+'</textarea>'+
    '<div id="sugWrap_'+side+'" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;align-items:center">'+
      '<span id="sugChips_'+side+'" style="display:flex;flex-wrap:wrap;gap:4px">'+
        '<span style="font-size:10px;color:#555;padding:3px 6px">yukleniyor...</span>'+
      '</span>'+
      '<button id="sugReroll_'+side+'" style="background:none;border:none;cursor:pointer;font-size:16px;color:#666;padding:2px 4px">\xf0\x9f\x8e\xb2</button>'+
    '</div>'+
    '<button class="btn-primary" style="background:'+c+'!important" id="saveSet">'+t('save')+'</button></div>';
  document.body.appendChild(ov);
  document.getElementById('modalCloseBtn').onclick=function(){ov.remove();};
  document.getElementById('aggSlider').addEventListener('input',function(){
    var ve=document.getElementById('aggVal_'+side);if(ve)ve.textContent=this.value+'/10';
  });
  document.getElementById('sugReroll_'+side).onclick=function(){rerollSuggestions(side);};
  document.getElementById('saveSet').onclick=function(){
    var m=document.getElementById('setModel').value,s2=document.getElementById('setSys').value;
    if(isL){S.modelL=m||'';S.sysL=s2}else{S.modelR=m||'';S.sysR=s2}
    var a=parseInt(document.getElementById('aggSlider').value)||5;A[side]=a;
    refreshUI();ov.remove();
  };
  loadSuggestions(side);
}

var _sugCache={};
async function loadSuggestions(side){
  var wrap=document.getElementById('sugChips_'+side);
  if(!wrap)return;
  var cacheKey=L;
  if(_sugCache[cacheKey]){
    var arr=_sugCache[cacheKey];
    var h='';
    for(var i=0;i<arr.length;i++){
      var label=String(arr[i]),isChar=i>=4;
      var bg=isChar?'#3d3520':'#2a2a2a',bd=isChar?'#5a4a20':'#333';
      h+='<button data-label="'+label+'" style="font-size:10px;padding:3px 8px;border-radius:12px;border:1px solid '+bd+';background:'+bg+';color:#bbb;cursor:pointer;white-space:nowrap;max-width:110px;overflow:hidden;text-overflow:ellipsis">'+label+'</button>';
    }
    wrap.innerHTML=h;
    bindSugButtons(wrap,side);
    return;
  }
  var lang=L==='tr'?'tr':'en';
  var seed=Math.random();
  var prompt=lang==='tr'?
    'Bir AI icin 7 tartisma kisisiligi onerisi uret. SADECE JSON array dondur. Ilk 4: tek kelime kisisilik (yaratici, cesitli). Son 3: unlu kisi/filozof/karakter. Ornek: ["soguk","sair","paranoyak","din adami","Karl Marx","Darth Vader","Sokrates"]. JSON disinda hicbir sey yazma. Seed:'+seed:
    'Generate 7 debate personality suggestions for an AI. ONLY return a JSON array. First 4: single-word personalities (be creative, varied). Last 3: famous person/philosopher/character. Example: ["cold","poet","paranoid","preacher","Karl Marx","Darth Vader","Socrates"]. Nothing but JSON. Seed:'+seed;
  try{
    var r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gemma3:27b',messages:[{role:'user',content:prompt}],options:{num_predict:180,temperature:1.4,top_p:.95}})});
    var d=await r.json();var raw=d.message?d.message.content:'';
    var m=raw.match(/\\[.*\\]/s);var arr=null;
    if(m)try{arr=JSON.parse(m[0])}catch(e){}
    if(!arr||arr.length<2){wrap.innerHTML='<span style="font-size:10px;color:#555;padding:3px 6px">--</span>';return}
    _sugCache[cacheKey]=arr;
    var h='';
    for(var i=0;i<arr.length;i++){
      var label=String(arr[i]),isChar=i>=4;
      var bg=isChar?'#3d3520':'#2a2a2a',bd=isChar?'#5a4a20':'#333';
      h+='<button data-label="'+label+'" style="font-size:10px;padding:3px 8px;border-radius:12px;border:1px solid '+bd+';background:'+bg+';color:#bbb;cursor:pointer;white-space:nowrap;max-width:110px;overflow:hidden;text-overflow:ellipsis">'+label+'</button>';
    }
    wrap.innerHTML=h;
    bindSugButtons(wrap,side);
  }catch(e){wrap.innerHTML='<span style="font-size:10px;color:#555;padding:3px 6px">--</span>'}
}

function bindSugButtons(wrap,side){
  var btns=wrap.querySelectorAll('button');
  for(var j=0;j<btns.length;j++){
    btns[j].onclick=function(){
      var ta=document.getElementById('setSys');
      if(!ta)return;
      var lbl=this.getAttribute('data-label');
      var cur=ta.value.trim();
      var p=lbl.length<25?('Tartisma stili: '+lbl+'.'):('Sen '+lbl+'sin. Onun gibi dusun ve konus.');
      ta.value=cur+(cur?'\\n':'')+p;
      ta.focus();
      rerollSuggestions(side);
    };
  }
}

function rerollSuggestions(side){
  var wrap=document.getElementById('sugChips_'+side);
  if(!wrap)return;
  _sugCache={};
  wrap.innerHTML='<span style="font-size:10px;color:#555;padding:3px 6px">yukleniyor...</span>';
  loadSuggestions(side);
}

TX.en.aggression='Agresyon';TX.tr.aggression='Agresyon';'''

html = html[:idx1] + new_settings + html[idx2:]
print("3. openSettings rewritten ✓")

# === SAVE & CHECK ===
with open('index.html', 'wb') as f:
    f.write(html)

m = re.search(rb'<script>(.*?)</script>', html, re.DOTALL)
js_code = m.group(1).decode('utf-8', errors='replace')
with open('__test.js', 'w') as f:
    f.write(js_code)

r = subprocess.run(['node', '--check', '__test.js'], capture_output=True, text=True)
if r.returncode == 0:
    print(f"✓ JS SYNTAX OK ({len(html)} bytes)")
else:
    print(f"✗ JS ERROR: {r.stderr[:400]}")

print("\n--- Verifications ---")
up_arrow_found = b'\u2191</button>' in html
print("Send arrow:", "OK" if up_arrow_found else "MISSING")
gs_count = html.count(b'function GS(')
print("GS single:", "OK" if gs_count == 1 else f"COUNT={gs_count}")
slider_ok = b"addEventListener('input'" in html
print("Slider listener:", "OK" if slider_ok else "MISSING")
tr_sug = b"lang==='tr'" in html
print("TR suggestions:", "OK" if tr_sug else "MISSING")
no_label = b'AI Oneriler' not in html
print("No label:", "OK" if no_label else "STILL THERE")
cache_ok = b'_sugCache={}' in html
print("Cache bust:", "OK" if cache_ok else "MISSING")
