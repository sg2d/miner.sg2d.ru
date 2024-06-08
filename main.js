"use strict";

const allHashes = 2 ** 32;
const maxWorkers = 32;
const workers = [];
const nonceSets = [];
//let fillStatsDimmPow = 6; // 7 => сторона 128 кластеров
//let fillStatsDimm = 2 ** fillStatsDimmPow;
let clustersDimmPow = null;
let clustersDimm = null;
let qClusters = null;
const randomClusters = [];
let lastCluster = 0;
let qNoncesInCluster = 0;

let tmrCheckWorkers = null;
let eTBodyWorkers;
let eTHInputHashesPerSecond;
let eTHInputHashesCore;
let eTestValue;
let eTBodyFillStats;
let eInputRemainedTime;

const exampleResponse = "{\"result\":{\"midstate\":\"fd8c924ed9a07c7d6dd49c1079429142d94cf99d6bb978e123190d52fbf8ef6f\",\
\"data\":\"0000000116237c0c0d1baffc50d4bf2a19bf5bc6fbf381c26bac4a0a0000db40000000008108b0619305607e7f04634ffe7ef35294970d5656694c6b7a0ef3b07b87e9ac4d8d90321b00\
f33900000000000000800000000000000000000000000000000000000000000000000000000000000000000000000000000080020000\",\
\"hash1\":\"00000000000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000010000\",\
\"target\":\"FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000\"},\"error\":null,\"id\":0}";

// init
document.addEventListener('DOMContentLoaded', () => {
	eTestValue = document.querySelector('#test_value');
	const resp = JSON.parse(exampleResponse).result;
	document.querySelector('#resp_midstate').value = resp.midstate;
	document.querySelector('#resp_data').value = resp.data;
	document.querySelector('#resp_hash1').value = resp.hash1;
	document.querySelector('#resp_target').value = resp.target;
	const eTableWorkers = document.querySelector('#workers_statistics');
	eTHInputHashesPerSecond = eTableWorkers.querySelector('#hashes_per_second');
	eTHInputHashesCore = eTableWorkers.querySelector('#hashes_core');
	eTBodyWorkers = eTableWorkers.getElementsByTagName('tbody')[0];
	const eRangeWorkers = document.querySelector('#rangeWorkers');
	for (let i = 0; i < maxWorkers; i++) {
		const option = document.createElement('option');
		option.value = i;
		option.innerHTML = i;
		eRangeWorkers.appendChild(option);
	}
	const eListWorkers = document.querySelector('#list_workers');
	eListWorkers.setAttribute('max', maxWorkers);
	eInputRemainedTime = document.querySelector('#remained_time');
	changeClustersDimmPow();
	changeWorkers();
});

function inputClustersDimmPow(event) {
	const dimmPow = parseInt(document.querySelector('#list_clusters_dimm_pow').value);
	const dimm = 2 ** dimmPow;
	document.querySelector('#list_clusters_text').innerHTML = getClusterCurrentValue(dimm);
}

function getClusterCurrentValue(dimm) {
	const qClusters = dimm * dimm;
	return dimm + 'x' + dimm + '=' + (dimm * dimm) + ' (&#8776;' + Math.round(allHashes / qClusters) + ' nonces/cluster)';
}

// Разобъём множество nonce на кластеры случайного размера и будем случайно перебирать их всех
	// TODO: Первый кластер проверяем в самую последнюю очередь, т.к. у большинства майнеров перебор nonce идёт с начала, т.е. с 0. Мой ПК не является суперкомпьютером, который первым найдёт решение, если оно в первом кластере.
function changeClustersDimmPow() {
	const input = document.querySelector('#list_clusters_dimm_pow');
	input.setAttribute('disabled', 'disabled');
	setTimeout(() => {
		clustersDimmPow = parseInt(document.querySelector('#list_clusters_dimm_pow').value);
		clustersDimm = 2 ** clustersDimmPow;
		qClusters = clustersDimm * clustersDimm;
		document.querySelector('#list_clusters_text').innerHTML = getClusterCurrentValue(clustersDimm);
		qNoncesInCluster = 2 ** (32 - clustersDimmPow * 2); // 4294967296 / 4096 = 1048576
		nonceSets.length = 0;
		const minNoncesInCluster = Math.round(0.1 * qClusters);
		let nonce = 0;
		for (let index = 0; index < qClusters; index++) {
			const qNonces = Math.max(minNoncesInCluster, Math.floor((qNoncesInCluster - minNoncesInCluster) * 2 * Math.random())); // Делим множество nonce случайными отрезками
			const item = {
				index: index + 1,
				start: nonce,
				count: qNonces - 1,
				//x: x, y: y, eTD: null, // см.ниже // const y = Math.floor(index / clustersDimm) + 1; const x = index - y * clustersDimm + 1;
				takenRandom: false,
			};
			nonceSets.push(item);
			nonce = safe_add(nonce, qNonces); //console.log(item.index + ' => nonce_start=' + item.start + ', nonce_count=' + item.count);
		}
		nonceSets[nonceSets.length - 1].count = -1 - nonceSets[nonceSets.length - 1].start;
		const eTableFillStats = document.querySelector('#fill_statistics');
		eTBodyFillStats = eTableFillStats.getElementsByTagName('tbody')[0];
		eTBodyFillStats.innerHTML = '';
		let index = 0;
		for (let y = 0; y < clustersDimm; y++) {
			const eRow = eTBodyFillStats.insertRow();
			for (let x = 0; x < clustersDimm; x++) {
				const eCell = eRow.insertCell();
				eCell.innerHTML = '&nbsp;';
				const oNonce = nonceSets[index];
				oNonce.x = x + 1;
				oNonce.y = y + 1;
				oNonce.eTD = eCell;
				index++;
			}
		}
		// Генерируем матрицу случайного (не последовательного) перебора кластеров nonces
		let b = 0;
		const lNoncesSets = nonceSets.length;
		for (let i = 0; i < lNoncesSets; i++) {
			nonceSets[i].takenRandom = false;
		}
		loop0: for (let i = 0; i < lNoncesSets; i++) {
			while (true) {
				if (++b > 2 ** 20) {
					console.error('Не удалось полностью сгенерировать матрицу случайного перебора кластеров nonces! i=' + i + ', b=' + b);
					break loop0;
				}
				const r = Math.floor(lNoncesSets * Math.random());
				if (nonceSets[r].takenRandom) {
					continue;
				}
				const oNonce = nonceSets[r];
				if (! oNonce.eTD) debugger;
				randomClusters[i] = oNonce;
				oNonce.takenRandom = true;
				oNonce.eTD.style.backgroundColor = '#ddd';
				break;
			}
		}
		input.removeAttribute('disabled');
	}, 0);
}

function changeWorkers() {
	const input = document.querySelector('#list_workers');
	input.setAttribute('disabled', 'disabled');
	setTimeout(() => {
		const qWorkers = parseInt(document.querySelector('#list_workers').value);
		document.querySelector('#workers_text').innerText = qWorkers;
		for (let i = eTBodyWorkers.rows.length - 1; i >= 0; i--) {
			eTBodyWorkers.removeChild(eTBodyWorkers.rows[i]);
		}
		for (let i = 0; i < workers.length; i++) {
			if (workers[i].workerThread) {
				workers[i].workerThread.terminate();
			}
		}
		workers.length = 0;
		for (let i = 0; i < qWorkers; i++) {
			const eRow = eTBodyWorkers.insertRow();
			const eCellUID = eRow.insertCell();
			eCellUID.innerText = i + 1;
			const eCellCluster = eRow.insertCell();
			eCellCluster.innerText = 'wait...';
			const eCellTotalHashes = eRow.insertCell();
			eCellTotalHashes.innerHTML = '<INPUT class="num" readonly/>';
			const eCellHashesPerSecond = eRow.insertCell();
			eCellHashesPerSecond.innerHTML = '<INPUT class="num" readonly/>';
			const eCellHashesCore = eRow.insertCell();
			eCellHashesCore.innerHTML = '<INPUT class="num" readonly/>';
			workers.push({
				hashes: 0,
				hashes_per_second: 0,
				hashes_core: 0,
				eCellCluster: eCellCluster,
				eInputHashes: eCellTotalHashes.firstElementChild,
				eInputHashesPerSecond: eCellHashesPerSecond.firstElementChild,
				eInputHashesCore: eCellHashesCore.firstElementChild,
				workerThread: null,
			});
		}
		input.removeAttribute('disabled');
	}, 100);
}
let stime;
function startMining() {
	const input1 = document.querySelector('#start_mining');
	input1.setAttribute('disabled', 'disabled');
	const input2 = document.querySelector('#list_workers');
	input2.setAttribute('disabled', 'disabled');
	const input3 = document.querySelector('#list_clusters_dimm_pow');
	input3.setAttribute('disabled', 'disabled');
	const input4 = document.querySelector('#stop_mining');
	input4.removeAttribute('disabled');
	document.querySelector('#golden_ticket').classList.remove('finded');
	document.querySelector('#golden_ticket').value = 'calc...';
	workersTerminate();
	for (let i = 0; i < workers.length; i++) {
		const worker = workers[i];
		worker.workerThread = new Worker('miner.js');
		worker.workerThread.onmessage = onWorkerMessage;
		worker.workerThread.onerror = onWorkerError;
		worker.status = 0; // wait job
		worker.hashes_core = 0;
		worker.hashes_per_second = null;
	}
	stime = new Date().getTime();
	checkWorkers();
	tmrCheckWorkers = setInterval(checkWorkers, 1000);
}

function getRemainedTimeText(remainedTime) { // вместо new Date(remainedTime).toISOString()
	const years = Math.floor(remainedTime / (1000 * 60 * 60 * 24 * 30 * 12));
	const months = Math.floor(remainedTime / (1000 * 60 * 60 * 24 * 30) % 12);
	const days = Math.floor(remainedTime / (1000 * 60 * 60 * 24) % 30);
	const hours = Math.floor((remainedTime / (1000 * 60 * 60)) % 24);
	const minutes = Math.floor((remainedTime / (1000 * 60)) % 60);
	const seconds = Math.floor((remainedTime / 1000) % 60);
	return '-' + (years > 0 ? years + 'y ' : '')
		+ (months > 0 ? months + 'm ' : '')
		+ (days > 0 ? days + 'd ' : '')
		+ (hours < 10 ? '0' : '') + hours + ':'
		+ (minutes < 10 ? '0' : '') + minutes + ':'
		+ (seconds < 10 ? '0' : '') + seconds;
}

function checkWorkers() {
	let cumHashesPerSecond = 0;
	let cumHashesCore = 0;
	for (let i = workers.length - 1; i >= 0; i--) {
		const worker = workers[i];
		cumHashesPerSecond += worker.hashes_per_second;
		cumHashesCore += worker.hashes_core;
	}
	eTHInputHashesPerSecond.value = Math.round(cumHashesPerSecond);
	const ratio = cumHashesCore/allHashes;
	const dtime = new Date().getTime() - stime;
	eTHInputHashesCore.value = (Math.round(10000*ratio)/100).toFixed(2) + '%';
	const remainedTime = Math.round(dtime / ratio);
	eInputRemainedTime.value = (isFinite(remainedTime) ? getRemainedTimeText(remainedTime) : 'wait...');
	if (lastCluster < nonceSets.length) {
		for (let i = 0; i < workers.length; i++) {
			if (workers[i].status === 0) {
				lastCluster++;
				if (lastCluster > nonceSets.length) {
					break;
				}
				const oCluster = randomClusters[lastCluster - 1];
				if (oCluster.takenRandom) {
					const worker = workers[i];
					var job = getJob(i + 1, oCluster.index, oCluster.start, oCluster.count);
					job.start_date = new Date().getTime();
					worker.status = 1;
					worker.workerThread.postMessage({
						job: job,
					});
					oCluster.eTD.style.backgroundColor = '#ff0';
					oCluster.eTD.style.borderColor = '#ffa';
					worker.eCellCluster.innerText = oCluster.index + '/' + oCluster.count;
				}
			}
		}
	}
}

function stopMining() {
	clearInterval(tmrCheckWorkers);
	tmrCheckWorkers = null;
	workersTerminate();
	const input1 = document.querySelector('#stop_mining');
	input1.setAttribute('disabled', 'disabled');
	const input2 = document.querySelector('#list_workers');
	input2.removeAttribute('disabled');
	const input3 = document.querySelector('#list_clusters_dimm_pow');
	input3.removeAttribute('disabled');
	const input4 = document.querySelector('#start_mining');
	input4.removeAttribute('disabled');
}

function workersTerminate() {
	for (let i = 0; i < workers.length; i++) {
		if (workers[i].workerThread) {
			workers[i].workerThread.terminate();
			workers[i].workerThread = null;
		}
	}
}

let index = 0;
function onWorkerMessage(event) {
	var job = event.data;
	index = job.uid - 1;
	const worker = workers[index];
	worker.status = job.status;
	if (worker) {
		const delta_time = (new Date().getTime()) - job.start_date;
		const hashes_per_second = Math.round(job.hashes * 1000 / delta_time);
		if (isFinite(hashes_per_second) && hashes_per_second !== 0) {
			worker.hashes_per_second = hashes_per_second;
			worker.eInputHashesPerSecond.value = worker.hashes_per_second;
		}
		worker.eInputHashes.value = job.hashes;
	}
	if (job.status === 0) {
		const oNonce = nonceSets[job.cluster_index - 1];
		if (job.golden_ticket !== false) {
			document.querySelector('#golden_ticket').classList.add('finded');
			document.querySelector('#golden_ticket').value = job.golden_ticket;
			stopMining();
			// TODO: отправить запрос к bitcoin.org на регистрацию хеша
			oNonce.eTD.style.backgroundColor = '#f00';
			oNonce.eTD.style.borderColor = '#ff0';
		} else {
			oNonce.eTD.style.backgroundColor = '#0f0';
			oNonce.eTD.style.borderColor = '#aaa';
		}
		worker.hashes_core += oNonce.count;
		worker.eInputHashesCore.value = worker.hashes_core;
	}
}

function onWorkerError(message) {
	throw message.data;
}

// TODO: сделать запросы к bitcoin.org
function getJob(uid, cluster_index, nonce_start, nonce_count) {
	//var workrequest = "{\"method\": \"getwork\", \"params\": \[\], \"id\":0}\r\n";
	//const response = "{\"result\":{\"midstate\":\"...\",\"data\":\"...\",\"hash1\":\"\",\"target\":\"...\"},\"error\":null,\"id\":0}";
	const resp = JSON.parse(exampleResponse).result;
	document.querySelector('#resp_midstate').value = resp.midstate;
	document.querySelector('#resp_data').value = resp.data;
	document.querySelector('#resp_hash1').value = resp.hash1;
	document.querySelector('#resp_target').value = resp.target;
	const job = {
		uid: uid,
		cluster_index: cluster_index,
		nonce_start: nonce_start,
		nonce_count: nonce_count,
		midstate: hexstringToBinary(resp.midstate),
		data: hexstringToBinary(resp.data),
		hash1: hexstringToBinary(resp.hash1),
		target: hexstringToBinary(resp.target),
	};
	// Remove the first 512-bits of data, since they aren't used in calculating hashes.
	job.data = job.data.slice(16);
	return job;
}

// Given a hex string, returns an array of 32-bit integers
// Data is assumed to be stored least-significant byte first (in the string)
function hexstringToBinary(str) {
	var result = new Array();
	for(var i = 0; i < str.length; i += 8) {
		var number = 0x00000000;
		for(var j = 0; j < 4; ++j) {
			number = safe_add(number, hexToByte(str.substring(i + j*2, i + j*2 + 2)) << (j*8));
		}
		result.push(number);
	}
	return result;
}

function hexToByte(hex) {
	return( parseInt(hex, 16));
}

function test() {
	let c = 0;
	let n = 2147483645; //2 ** 31 - 1000;
	let m = n;
	console.log(n + '/' + m);
	let t = setInterval(() => {
		n = safe_add(n, 1048576);
		m = m + 1048576;
		console.log(n + '/' + m);
		eTestValue.innerText = n + '/' + m;
		//if (n !== m) clearInterval(t);
		if (++c > 10) clearInterval(t);
	}, 0);
}