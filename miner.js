// For fun, and useful reference, this code often uses 
// strange verbage. Here is a reference:
//
// Golden Hash - A final SHA-256 hash which is less than the getwork Target.
// Golden Ticket - The nonce that gave rise to a Golden Hash.
//
// This is in reference to the classic story of Willy Wonka and the Chocolate Factory.

importScripts('sha256.js');

let hashes;
let target = 0x00000000;

// Function: scanhash
// 
// This function attempts to find a Golden Ticket for the
// given parameters.
//
// All of the arguments for this function can be supplied
// by a Bitcoin getwork request.
//
// midstate is 256-bits:	Array of 8, 32-bit numbers
// data is 512-bits:		Array of 16, 32-bit numbers
// hash1 is 256-bits:		Array of 8, 32-bit numbers
// target is 256-bits:		Array of 8, 32-bit numbers
//
// Returns a Golden Ticket (32-bit number) or false
function scanhash(midstate, data, hash1, target, nonce_start, nonce_count, progressReport) {
	// Nonce is a number which starts at 0 and increments until 0xFFFFFFFF
	var nonce = nonce_start;

	while (nonce_count >= 0) {
		nonce_count--;

		// The nonce goes into the 4th 32-bit word
		data[4] = nonce;

		// Now let us see if this nonce results in a Golden Hash
		var hash = sha256_chunk(midstate, data);
		hash = sha256_chunk(SHA_256_INITIAL_STATE, hash.concat(hash1));

		hashes++;

		// Tests if a given hash is a less than or equal to the given target.
		// NOTE: For Simplicity this just checks that the highest 32-bit word is 0x00000000
		// TODO: Do a full comparison
		// hash is 256-bits:		Array of 8, 32-bit numbers
		// target is 256-bits:		Array of 8, 32-bit numbers
		if (hash[7] == target) {
			return nonce;
		}

		if (nonce % 100000 == 0) progressReport();

		// If this was the last possible nonce, quit
		//if (nonce == 0xFFFFFFFF) break;

		// Increment nonce
		nonce = safe_add(nonce, 1);
	}
	return false;
}

onmessage = function(event) {
	const message = event.data;
	let job = message.job;
	job.golden_ticket = false;
	job.status = 1; // work
	hashes = 0;
	sendProgressUpdate(job);
	// Send occasional progress updates
	//setInterval(function() { sendProgressUpdate(job); }, 10000);
	// Scanning compelted. Send back the results
	job.golden_ticket = scanhash(
		job.midstate,
		job.data,
		job.hash1,
		job.target,
		job.nonce_start,
		job.nonce_count,
		function() {
			sendProgressUpdate(job);
		},
	);
	job.status = 0;
	postMessage(job);
};

function sendProgressUpdate(job) {
	job.hashes = hashes;
	postMessage(job);
}

 
