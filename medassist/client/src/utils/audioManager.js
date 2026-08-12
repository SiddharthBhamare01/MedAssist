// Global audio manager — ensures only one audio clip plays at any time across the entire app.
// Both the "Listen to Report" button and the chatbot use this so they never overlap.

let _audio = null;
let _onStop = null; // called when audio is interrupted by a new clip

/**
 * @param {function} onError  called if the clip cannot be decoded or played.
 *   Without it, a failed play() is indistinguishable from silence: onEnd never
 *   fires, so any caller awaiting playback hangs forever with no sound and no
 *   error. Callers that chain clips must handle this.
 */
export function playAudio(blobUrl, { onEnd, onStop, onError } = {}) {
  // Always stop whatever is currently playing first
  if (_audio) {
    _audio.pause();
    if (_onStop) _onStop();
    _audio = null;
    _onStop = null;
  }

  const audio = new Audio(blobUrl);
  _audio = audio;
  _onStop = onStop || null;

  audio.onended = () => {
    _audio = null;
    _onStop = null;
    if (onEnd) onEnd();
  };

  const fail = (err) => {
    if (_audio === audio) { _audio = null; _onStop = null; }
    if (onError) onError(err);
  };

  audio.onerror = () => fail(new Error('Audio could not be decoded'));
  audio.play().catch(fail);
  return audio;
}

export function stopAudio() {
  if (_audio) {
    _audio.pause();
    if (_onStop) _onStop();
    _audio = null;
    _onStop = null;
  }
}
