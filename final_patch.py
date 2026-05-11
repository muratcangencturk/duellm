#!/usr/bin/env python3
import re, subprocess

with open('/tmp/duellm/base.html', 'rb') as f:
    html = f.read()

print(f"Base: {len(html)} bytes")

# === 1. SLIDER LISTENER + save aggression ===
save_idx = html.find(b"document.getElementById('saveSet').onclick=function(){")
if save_idx > 0:
    end_save = html.find(b'};\n}\n\n', save_idx + 50)
    if end_save > 0:
        end_save += 1
        new_onclick = (b"document.getElementById('saveSet').onclick=function(){\n"
            b"    var m=document.getElementById('setModel').value,s2=document.getElementById('setSys').value;\n"
            b"    if(isL){S.modelL=m||'';S.sysL=s2}else{S.modelR=m||'';S.sysR=s2}\n"
            b"    var a=parseInt(document.getElementById('aggSlider').value)||5;A[side]=a;\n"
            b"    refreshUI();ov.remove();\n"
            b"  };\n"
            b"  document.getElementById('aggSlider').addEventListener('input',function(){\n"
            b"    var ve=document.getElementById('aggVal_'+side);if(ve)ve.textContent=this.value+'/10';\n"
            b"  });\n}")
        html = html[:save_idx] + new_onclick + html[end_save:]
        print("1. Slider + save fixed")

# === 2. CHIPS HTML in modal (between textarea and save button) ===
textarea_end = html.find(b"placeholder=\\\"'+t('spPlace')+'\"")
if textarea_end > 0:
    segment_end = html.find(b"'+\n    '<button class=\\\"btn-primary\\\"", textarea_end)
    if segment_end > 0:
        chips = b"""'+
    '<div id=\\"sugWrap_'+side+'\\" style=\\"display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;align-items:center\\">'+
      '<span id=\\"sugChips_'+side+'\\" style=\\"display:flex;flex-wrap:wrap;gap:4px\\">'+
        '<span style=\\"font-size:10px;color:#555;padding:3px 6px\\">yukleniyor...</span>'+
      '</span>'+
      '<button id=\\"sugReroll_'+side+'\\" style=\\"background:none;border:none;cursor:pointer;font-size:16px;color:#666;padding:2px 4px\\">\\xf0\\x9f\\x8e\\xb2</button>'+
    '</div>'+
    '"""
        html = html[:segment_end] + chips + html[segment_end:]
        print("2. Chips HTML added")

# === 3. loadSuggestions call after appendChild ===
append_call = html.find(b"document.body.appendChild(ov);")
if append_call > 0:
    end_stmt = append_call + len(b"document.body.appendChild(ov);")
    html = html[:end_stmt] + b"\n  loadSuggestions(side);" + html[end_stmt:]
    print("3. loadSuggestions call added")

# === 4. Suggestion functions before SHARE ===
share_idx = html.find(b"// \xe2\x94\x80\xe2\x94\x80 SHARE \xe2\x94\x80\xe2\x94\x80")
if share_idx > 0:
    sug_funcs = b"""
var _sugCache={};
async function loadSuggestions(side){
  var wrap=document.getElementById('sugChips_'+side);
  if(!wrap)return;
  if(_sugCache[L]){var arr=_sugCache[L];renderChips(wrap,arr,side);return;}
  var lang=L==='tr'?'tr':'en';
  var seed=Math.random();
  var prompt=lang==='tr'?
    'Bir AI icin 7 tartisma kisisiligi onerisi uret. SADECE JSON array dondur. Ilk 4: tek kelime kisisilik stilleri (yaratici, her sefer farkli, tekrar etme). Son 3: unlu kisi, filozof veya kurgu karakter ismi. Ornek format: ["soguk","sair","paranoyak","din adami","Karl Marx","Darth Vader","Sokrates"]. JSON disinda HICBIR SEY YAZMA. Seed:'+seed:
    'Generate 7 debate personality suggestions. ONLY return raw JSON array. First 4: single-word personality styles (creative, each time different, no repeats). Last 3: famous person, philosopher or fictional character. Example: ["cold","poet","paranoid","preacher","Karl Marx","Darth Vader","Socrates"]. ONLY JSON ARRAY, NOTHING ELSE. Seed:'+seed;
  try{
    var r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'gemma3:27b',messages:[{role:'user',content:prompt}],options:{num_predict:180,temperature:1.4,top_p:.95}})});
    var d=await r.json();var raw=d.message?d.message.content:'';
    var m=raw.match(/\\[.*\\]/s);var arr=null;
    if(m)try{arr=JSON.parse(m[0])}catch(e){}
    if(!arr||arr.length<2){wrap.innerHTML='<span style=\"font-size:10px;color:#555;padding:3px 6px\">--</span>';return}
    _sugCache[L]=arr;renderChips(wrap,arr,side);
  }catch(e){wrap.innerHTML='<span style=\"font-size:10px;color:#555;padding:3px 6px\">--</span>'}
}
function renderChips(wrap,arr,side){
  var h='';
  for(var i=0;i<arr.length;i++){
    var label=String(arr[i]),isChar=i>=4;
    var bg=isChar?'#3d3520':'#2a2a2a',bd=isChar?'#5a4a20':'#333';
    h+='<button data-label=\"'+label+'\" style=\"font-size:10px;padding:3px 8px;border-radius:12px;border:1px solid '+bd+';background:'+bg+';color:#bbb;cursor:pointer;white-space:nowrap;max-width:110px;overflow:hidden;text-overflow:ellipsis\">'+label+'</button>';
  }
  wrap.innerHTML=h;
  var btns=wrap.querySelectorAll('button');
  for(var j=0;j<btns.length;j++){
    btns[j].onclick=function(){
      var ta=document.getElementById('setSys');
      if(!ta)return;
      var lbl=this.getAttribute('data-label');
      var cur=ta.value.trim();
      var p=lbl.length<25?('Tartisma stili: '+lbl+'.'):('Sen '+lbl+'sin. Onun gibi dusun ve konus.');
      ta.value=cur+(cur?'\\n':'')+p;ta.focus();
      rerollSuggestions(side);
    };
  }
}
function rerollSuggestions(side){
  var wrap=document.getElementById('sugChips_'+side);
  if(!wrap)return;
  _sugCache={};
  wrap.innerHTML='<span style=\"font-size:10px;color:#555;padding:3px 6px\">yukleniyor...</span>';
  loadSuggestions(side);
}
"""
    html = html[:share_idx] + sug_funcs + b"\n" + html[share_idx:]
    print("4. Suggestion functions added")

# === VERIFY ===
print(f"Tags: {html.count(b'<script>')}/{html.count(b'</script>')}")
m = re.search(rb'<script>(.*?)</script>', html, re.DOTALL)
if m:
    js = m.group(1).decode('utf-8', errors='replace')
    open('/tmp/duellm/__test.js', 'w').write(js)
    r = subprocess.run(['node', '--check', '/tmp/duellm/__test.js'], capture_output=True, text=True)
    if r.returncode == 0:
        print("JS SYNTAX OK!")
    else:
        print("JS ERROR:", r.stderr[:300])
else:
    print("NO script tags!")

open('/tmp/duellm/dist/index.html', 'wb').write(html)
print(f"Done: {len(html)} bytes")
