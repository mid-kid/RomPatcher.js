/* Rom Patcher JS v20200502 - Marc Robledo 2016-2020 - http://www.marcrobledo.com/license */

const TOO_BIG_ROM_SIZE=67108863;


var romFile, romValid, patchFile, patch, romFile1, romFile2, tempFile, headerSize, oldHeader;
var fetchedPatches;
var userLanguage;

var CAN_USE_WEB_WORKERS=false;


/* Shortcuts */
function addEvent(e,ev,f){e.addEventListener(ev,f,false)}
function el(e){return document.getElementById(e)}
function _(str){return userLanguage[str] || str}



function fetchPatch(uri){
	setTabApplyEnabled(false);
	setMessage('apply', _('downloading'), 'loading');


	var isCompressed=/\#/.test(uri);
	var patchURI=decodeURI(uri.replace(/\#.*?$/, ''));
	//console.log(patchURI);
	var compressedName=uri.replace(/^.*?\#/,'');
	//console.log(compressedName);


	if(typeof window.fetch==='function'){
		fetch(patchURI)
			.then(result => result.arrayBuffer()) // Gets the response and returns it as a blob
			.then(arrayBuffer => {
				fetchedPatches[patchURI]=patchFile=new MarcFile(arrayBuffer);
				fetchedPatches[patchURI].fileName=patchURI.replace(/^(.*?\/)+/g, '');
				_readPatchFile();
			})
			.catch(function(evt){
				setMessage('apply', _('error_downloading'), 'error');
				//setMessage('apply', evt.message, 'error');
			});
	}else{
		var xhr=new XMLHttpRequest();
		xhr.open('GET', patchURI, true);
		xhr.responseType='arraybuffer';

		xhr.onload=function(evt){
			if(this.status===200){
				fetchedPatches[patchURI]=patchFile=new MarcFile(xhr.response);
				fetchedPatches[patchURI].fileName=patchURI.replace(/^(.*?\/)+/g, '');
				_readPatchFile();
			}else{
				setMessage('apply', _('error_downloading')+' ('+this.status+')', 'error');
			}
		};

		xhr.onerror=function(evt){
			setMessage('apply', _('error_downloading'), 'error');
		};

		xhr.send(null);
	}
}


function _parseROM(){
	if(romFile.readString(4).startsWith(ZIP_MAGIC)){
		parseZIPFile(romFile);
		setTabApplyEnabled(false);
	}else{
		updateChecksums(romFile, 0);
	}
}


/* initialize app */
addEvent(window,'load',function(){
	/* zip-js web worker */
	if(CAN_USE_WEB_WORKERS){
		zip.useWebWorkers=true;
		zip.workerScriptsPath='./js/zip.js/';
	}else{
		zip.useWebWorkers=false;

		var script=document.createElement('script');
		script.src='./js/zip.js/inflate.js';
		document.getElementsByTagName('head')[0].appendChild(script);
	}

	/* language */
	var langCode=(navigator.language || navigator.userLanguage).substr(0,2);
	if(typeof LOCALIZATION[langCode]==='object'){
		userLanguage=LOCALIZATION[langCode];
	}else{
		userLanguage=LOCALIZATION.en;
	}
	var translatableElements=document.querySelectorAll('*[data-localize]');
	for(var i=0; i<translatableElements.length; i++){
		translatableElements[i].innerHTML=_(translatableElements[i].dataset.localize);
	}
	
	el('row-file-patch').title=_('compatible_formats')+' IPS, UPS, APS, BPS, RUP, PPF, MOD (Paper Mario Star Rod), xdelta';
	
	el('input-file-rom').value='';
	el('input-file-patch').value='';
	setTabApplyEnabled(true);

	addEvent(el('input-file-rom'), 'change', function(){
		setTabApplyEnabled(false);
		romFile=new MarcFile(this, _parseROM);
	});



	/* predefined patches */
	if(typeof PREDEFINED_PATCHES!=='undefined'){
		fetchedPatches={};

		var container=el('input-file-patch').parentElement;
		container.removeChild(el('input-file-patch'));

		var select=document.createElement('select');
		select.id='input-file-patch';
		for(var i=0; i<PREDEFINED_PATCHES.length; i++){
			var option=document.createElement('option');
			option.value=PREDEFINED_PATCHES[i].patch;
			option.innerHTML=PREDEFINED_PATCHES[i].name;
			select.appendChild(option);
		}
		container.appendChild(select)
		container.parentElement.title='';


		addEvent(select,'change',function(){
			if(fetchedPatches[this.value.replace(/\#.*?$/, '')]){
				patchFile=fetchedPatches[this.value.replace(/\#.*?$/, '')];
				patchFile.seek(0);
				_readPatchFile();
			}else{
				patch=null;
				patchFile=null;
				fetchPatch(this.value);
			}
		});
		fetchPatch(select.value);
	}else{
		setTabCreateEnabled(true);
		el('input-file-rom1').value='';
		el('input-file-rom2').value='';

		el('switch-container').style.visibility='visible';

		addEvent(el('input-file-patch'), 'change', function(){
			setTabApplyEnabled(false);
			patchFile=new MarcFile(this, _readPatchFile)
		});
		addEvent(el('input-file-rom1'), 'change', function(){
			setTabCreateEnabled(false);
			romFile1=new MarcFile(this, function(){setTabCreateEnabled(true)});
		});
		addEvent(el('input-file-rom2'), 'change', function(){
			setTabCreateEnabled(false);
			romFile2=new MarcFile(this, function(){setTabCreateEnabled(true)});
		});
	}





	//setCreatorMode(true);
});



function updateChecksums(file, startOffset, force){
	if(file===romFile && file.fileSize>33554432 && !force){
		el('crc32').innerHTML='File is too big. <span onclick=\"updateChecksums(romFile,'+startOffset+',true)\">Force calculate checksum</span>';
		el('md5').innerHTML='';
		el('sha1').innerHTML='';
		setTabApplyEnabled(true);
		return false;
	}
	el('crc32').innerHTML='Calculating...';
	el('md5').innerHTML='Calculating...';

	if(CAN_USE_WEB_WORKERS){
		setTabApplyEnabled(false);
		webWorkerCrc.postMessage({u8array:file._u8array, startOffset:startOffset}, [file._u8array.buffer]);

		if(window.crypto&&window.crypto.subtle&&window.crypto.subtle.digest){
			el('sha1').innerHTML='Calculating...';
		}
	}else{
		window.setTimeout(function(){
			el('crc32').innerHTML=padZeroes(crc32(file, startOffset), 4);
			el('md5').innerHTML=padZeroes(md5(file, startOffset), 16);

			validateSource();
			setTabApplyEnabled(true);
		}, 30);

		if(window.crypto&&window.crypto.subtle&&window.crypto.subtle.digest){
			el('sha1').innerHTML='Calculating...';
			sha1(file);
		}
	}
}

function validateSource(){
	romValid=false;
	if(patch && romFile && typeof patch.validateSource !== 'undefined'){
		if(patch.validateSource(romFile, false)){
			romValid=true;
			el('crc32').className='valid';
			setMessage('apply');
		}else{
			el('crc32').className='invalid';
			setMessage('apply', _('error_crc_input'), 'error');
		}
	}else{
		el('crc32').className='';
		setMessage('apply');
	}
}



function _readPatchFile(){
	setTabApplyEnabled(false);
	patchFile.littleEndian=false;

	var header=patchFile.readString(6);
	if(header.startsWith(ZIP_MAGIC)){
		if(typeof PREDEFINED_PATCHES !== 'undefined' && /\#/.test(el('input-file-patch').value)){
			parseZIPFile(patchFile, el('input-file-patch').value.replace(/^.*?\#/, ''));
		}else{
			parseZIPFile(patchFile);
		}
		patch=false;
		validateSource();
		setTabApplyEnabled(false);
	}else{
		if(typeof IPS_MAGIC !== 'undefined' && header.startsWith(IPS_MAGIC)){
			patch=parseIPSFile(patchFile);
		}else if(typeof UPS_MAGIC!=='undefined' && header.startsWith(UPS_MAGIC)){
			patch=parseUPSFile(patchFile);
		}else if(typeof APS_MAGIC!=='undefined' && header.startsWith(APS_MAGIC)){
			patch=parseAPSFile(patchFile);
		}else if(typeof BPS_MAGIC!=='undefined' && header.startsWith(BPS_MAGIC)){
			patch=parseBPSFile(patchFile);
		}else if(typeof RUP_MAGIC!=='undefined' && header.startsWith(RUP_MAGIC)){
			patch=parseRUPFile(patchFile);
		}else if(typeof PPF_MAGIC!=='undefined' && header.startsWith(PPF_MAGIC)){
			patch=parsePPFFile(patchFile);
		}else if(typeof PMSR_MAGIC!=='undefined' && header.startsWith(PMSR_MAGIC)){
			patch=parseMODFile(patchFile);
		}else if(typeof VCDIFF_MAGIC!=='undefined' && header.startsWith(VCDIFF_MAGIC)){
			patch=parseVCDIFF(patchFile);
		}else{
			patch=null;
			setMessage('apply', _('error_invalid_patch'), 'error');
		}

		if(patch && typeof PREDEFINED_PATCHES!=='undefined' && PREDEFINED_PATCHES[el('input-file-patch').selectedIndex].crc){
			patch.validateSource=function(romFile, headerSize){
				return PREDEFINED_PATCHES[el('input-file-patch').selectedIndex].crc===crc32(romFile, headerSize)
			}
		}

		validateSource();
		setTabApplyEnabled(true);
	}
}





function preparePatchedRom(originalRom, patchedRom, headerSize){
	if(typeof PREDEFINED_PATCHES!=='undefined'){
		patchedRom.fileName=PREDEFINED_PATCHES[el('input-file-patch').selectedIndex].name + '.gba';
	}else{
		patchedRom.fileName=originalRom.fileName.replace(/\.([^\.]*?)$/, ' (patched).$1');
	}
	patchedRom.fileType=originalRom.fileType;

	setMessage('apply');
	patchedRom.save();
	
	//debug: create unheadered patch
	/*if(headerSize && el('checkbox-addheader').checked){
		createPatch(romFile, patchedRom);
	}*/
}


/*function removeHeader(romFile){
	//r._dataView=new DataView(r._dataView.buffer, headerSize);
	oldHeader=romFile.slice(0,headerSize);
	r=r.slice(headerSize);
}*/
function applyPatch(p,r,validateChecksums){
	if(p && r){
		if(CAN_USE_WEB_WORKERS){
			setMessage('apply', _('applying_patch'), 'loading');
			setTabApplyEnabled(false);

			webWorkerApply.postMessage(
				{
					romFileU8Array:r._u8array,
					patchFileU8Array:patchFile._u8array,
					validateChecksums:validateChecksums
				},[
					r._u8array.buffer,
					patchFile._u8array.buffer
				]
			);

		}else{
			setMessage('apply', _('applying_patch'), 'loading');

			try{
				p.apply(r, validateChecksums);
				preparePatchedRom(r, p.apply(r, validateChecksums), headerSize);

			}catch(e){
				setMessage('apply', 'Error: '+_(e.message), 'error');
			}
		}

	}else{
		setMessage('apply', 'No ROM/patch selected', 'error');
	}
}







function createPatch(sourceFile, modifiedFile, mode){
	if(!sourceFile){
		setMessage('create', 'No source ROM file specified.', 'error');
		return false;
	}else if(!modifiedFile){
		setMessage('create', 'No modified ROM file specified.', 'error');
		return false;
	}


	if(CAN_USE_WEB_WORKERS){
		setTabCreateEnabled(false);

		setMessage('create', _('creating_patch'), 'loading');

		webWorkerCreate.postMessage(
			{
				sourceFileU8Array:sourceFile._u8array,
				modifiedFileU8Array:modifiedFile._u8array,
				modifiedFileName:modifiedFile.fileName,
				patchMode:mode
			},[
				sourceFile._u8array.buffer,
				modifiedFile._u8array.buffer
			]
		);
		
		romFile1=new MarcFile(el('input-file-rom1'));
		romFile2=new MarcFile(el('input-file-rom2'));
	}else{
		try{
			sourceFile.seek(0);
			modifiedFile.seek(0);

			var newPatch;
			if(mode==='ips'){
				newPatch=createIPSFromFiles(sourceFile, modifiedFile);
			}else if(mode==='bps'){
				newPatch=createBPSFromFiles(sourceFile, modifiedFile, (sourceFile.fileSize<=4194304));
			}else if(mode==='ups'){
				newPatch=createUPSFromFiles(sourceFile, modifiedFile);
			}else if(mode==='aps'){
				newPatch=createAPSFromFiles(sourceFile, modifiedFile);
			}else if(mode==='rup'){
				newPatch=createRUPFromFiles(sourceFile, modifiedFile);
			}else{
				setMessage('create', _('error_invalid_patch'), 'error');
			}


			if(crc32(modifiedFile)===crc32(newPatch.apply(sourceFile))){
				newPatch.export(modifiedFile.fileName.replace(/\.[^\.]+$/,'')).save();
			}else{
				setMessage('create', 'Unexpected error: verification failed. Patched file and modified file mismatch. Please report this bug.', 'error');
			}

		}catch(e){
			setMessage('create', 'Error: '+_(e.message), 'error');
		}
	}
}




/* GUI functions */
function setMessage(tab, msg, className){
	var messageBox=el('message-'+tab);
	if(msg){
		if(className==='loading'){
			messageBox.className='message';
			messageBox.innerHTML='<span class="loading"></span> '+msg;
		}else{
			messageBox.className='message '+className;
			if(className==='warning')
				messageBox.innerHTML='&#9888; '+msg;
			else if(className==='error')
				messageBox.innerHTML='&#10007; '+msg;
			else
				messageBox.innerHTML=msg;
		}
		messageBox.style.display='inline';
	}else{
		messageBox.style.display='none';
	}
}

function setElementEnabled(element,status){
	if(status){
		el(element).className='enabled';
	}else{
		el(element).className='disabled';
	}
	el(element).disabled=!status;
}
function setTabCreateEnabled(status){
	if(
		(romFile1 && romFile1.fileSize>TOO_BIG_ROM_SIZE) ||
		(romFile2 && romFile2.fileSize>TOO_BIG_ROM_SIZE)
	){
		setMessage('create',_('warning_too_big'),'warning');
	}
	setElementEnabled('input-file-rom1', status);
	setElementEnabled('input-file-rom2', status);
	setElementEnabled('select-patch-type', status);
	if(romFile1 && romFile2 && status){
		setElementEnabled('button-create', status);
	}else{
		setElementEnabled('button-create', false);
	}
}
function setTabApplyEnabled(status){
	setElementEnabled('input-file-rom', status);
	setElementEnabled('input-file-patch', status);
	if(romFile && romValid && status && (patch || typeof PREDEFINED_PATCHES!=='undefined')){
		setElementEnabled('button-apply', status);
	}else{
		setElementEnabled('button-apply', false);
	}
}
function setCreatorMode(creatorMode){
	if(creatorMode){
		el('tab0').style.display='none';
		el('tab1').style.display='block';
		el('switch-create').className='switch enabled'
	}else{
		el('tab0').style.display='block';
		el('tab1').style.display='none';
		el('switch-create').className='switch disabled'
	}
}








/* FileSaver.js (source: http://purl.eligrey.com/github/FileSaver.js/blob/master/src/FileSaver.js)
 * A saveAs() FileSaver implementation.
 * 1.3.8
 * 2018-03-22 14:03:47
 *
 * By Eli Grey, https://eligrey.com
 * License: MIT
 *   See https://github.com/eligrey/FileSaver.js/blob/master/LICENSE.md
 */
var saveAs=saveAs||function(c){"use strict";if(!(void 0===c||"undefined"!=typeof navigator&&/MSIE [1-9]\./.test(navigator.userAgent))){var t=c.document,f=function(){return c.URL||c.webkitURL||c},s=t.createElementNS("http://www.w3.org/1999/xhtml","a"),d="download"in s,u=/constructor/i.test(c.HTMLElement)||c.safari,l=/CriOS\/[\d]+/.test(navigator.userAgent),p=c.setImmediate||c.setTimeout,v=function(t){p(function(){throw t},0)},w=function(t){setTimeout(function(){"string"==typeof t?f().revokeObjectURL(t):t.remove()},4e4)},m=function(t){return/^\s*(?:text\/\S*|application\/xml|\S*\/\S*\+xml)\s*;.*charset\s*=\s*utf-8/i.test(t.type)?new Blob([String.fromCharCode(65279),t],{type:t.type}):t},r=function(t,n,e){e||(t=m(t));var r,o=this,a="application/octet-stream"===t.type,i=function(){!function(t,e,n){for(var r=(e=[].concat(e)).length;r--;){var o=t["on"+e[r]];if("function"==typeof o)try{o.call(t,n||t)}catch(t){v(t)}}}(o,"writestart progress write writeend".split(" "))};if(o.readyState=o.INIT,d)return r=f().createObjectURL(t),void p(function(){var t,e;s.href=r,s.download=n,t=s,e=new MouseEvent("click"),t.dispatchEvent(e),i(),w(r),o.readyState=o.DONE},0);!function(){if((l||a&&u)&&c.FileReader){var e=new FileReader;return e.onloadend=function(){var t=l?e.result:e.result.replace(/^data:[^;]*;/,"data:attachment/file;");c.open(t,"_blank")||(c.location.href=t),t=void 0,o.readyState=o.DONE,i()},e.readAsDataURL(t),o.readyState=o.INIT}r||(r=f().createObjectURL(t)),a?c.location.href=r:c.open(r,"_blank")||(c.location.href=r);o.readyState=o.DONE,i(),w(r)}()},e=r.prototype;return"undefined"!=typeof navigator&&navigator.msSaveOrOpenBlob?function(t,e,n){return e=e||t.name||"download",n||(t=m(t)),navigator.msSaveOrOpenBlob(t,e)}:(e.abort=function(){},e.readyState=e.INIT=0,e.WRITING=1,e.DONE=2,e.error=e.onwritestart=e.onprogress=e.onwrite=e.onabort=e.onerror=e.onwriteend=null,function(t,e,n){return new r(t,e||t.name||"download",n)})}}("undefined"!=typeof self&&self||"undefined"!=typeof window&&window||this);
