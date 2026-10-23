/**
 * Interactive walkthrough player (shared shell).
 * Usage: InteractiveWalkthrough.mount(document.getElementById('iw-app'), { slides: [...] })
 *
 * Slide fields:
 *   kind: 'title' | 'step' | 'answer' (optional; affects chrome)
 *   kicker: small uppercase label
 *   title: string (HTML ok for math spans)
 *   num: step number shown in badge (omit on title)
 *   accent: CSS color for badge / why border
 *   whyBg: optional why panel bg
 *   body: HTML string
 *   why: HTML string (optional aside)
 *   voice: plain text spoken via Web Speech API (or ignored if audio set)
 *   audio: optional URL to mp3/ogg; when present, Replay/autoplay use it instead of TTS
 */
(function (global) {
  'use strict';

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'className') n.className = attrs[k];
        else if (k === 'text') n.textContent = attrs[k];
        else if (k === 'html') n.innerHTML = attrs[k];
        else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
      });
    }
    (kids || []).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function typeset(root) {
    if (global.MathJax && MathJax.typesetPromise) {
      return MathJax.typesetPromise([root]).catch(function () {});
    }
    return Promise.resolve();
  }

  function InteractiveWalkthrough(root, config) {
    this.root = root;
    this.slides = (config && config.slides) || [];
    this.i = 0;
    this.autoplay = config.autoplay !== false;
    this.muted = !!config.muted;
    this._audioEl = null;
    this._utter = null;
    this._build();
    this._show(0, true);
  }

  InteractiveWalkthrough.prototype._build = function () {
    var self = this;
    this.root.innerHTML = '';
    this.root.id = this.root.id || 'iw-app';

    this.progress = el('div', { id: 'iw-progress', 'aria-live': 'polite' });
    this.btnMute = el('button', {
      type: 'button', id: 'iw-mute', 'aria-pressed': 'false',
      text: 'Mute', onclick: function () { self._toggleMute(); }
    });
    this.btnAuto = el('button', {
      type: 'button', id: 'iw-autoplay', 'aria-pressed': String(this.autoplay),
      text: 'Auto voice: ' + (this.autoplay ? 'On' : 'Off'),
      onclick: function () { self._toggleAuto(); }
    });
    var toggles = el('div', { id: 'iw-toggles' }, [this.btnAuto, this.btnMute]);
    var top = el('div', { id: 'iw-topbar' }, [this.progress, toggles]);

    this.slideEl = el('div', { id: 'iw-slide', role: 'region', 'aria-live': 'polite' });
    var stage = el('div', { id: 'iw-stage' }, [this.slideEl]);

    this.btnBack = el('button', {
      type: 'button', id: 'iw-back', text: '← Back',
      onclick: function () { self.prev(); }
    });
    this.btnReplay = el('button', {
      type: 'button', id: 'iw-replay', text: '↻ Replay voice',
      onclick: function () { self.speak(true); }
    });
    this.speaking = el('span', { id: 'iw-speaking', 'aria-live': 'polite', text: '' });
    this.btnNext = el('button', {
      type: 'button', id: 'iw-next', text: 'Next →',
      onclick: function () { self.next(); }
    });
    var nav = el('div', { id: 'iw-nav' }, [
      this.btnBack, this.btnReplay, this.speaking, this.btnNext
    ]);

    this.root.appendChild(top);
    this.root.appendChild(stage);
    this.root.appendChild(nav);

    document.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        self.next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        self.prev();
      } else if (e.key === 'r' || e.key === 'R') {
        self.speak(true);
      }
    });
  };

  InteractiveWalkthrough.prototype._toggleMute = function () {
    this.muted = !this.muted;
    this.btnMute.setAttribute('aria-pressed', String(this.muted));
    this.btnMute.textContent = this.muted ? 'Unmute' : 'Mute';
    if (this.muted) this.stopVoice();
  };

  InteractiveWalkthrough.prototype._toggleAuto = function () {
    this.autoplay = !this.autoplay;
    this.btnAuto.setAttribute('aria-pressed', String(this.autoplay));
    this.btnAuto.textContent = 'Auto voice: ' + (this.autoplay ? 'On' : 'Off');
    if (!this.autoplay) this.stopVoice();
  };

  InteractiveWalkthrough.prototype.stopVoice = function () {
    if (global.speechSynthesis) speechSynthesis.cancel();
    if (this._audioEl) {
      try { this._audioEl.pause(); this._audioEl.currentTime = 0; } catch (e) {}
      this._audioEl = null;
    }
    this._utter = null;
    this.speaking.textContent = '';
  };

  InteractiveWalkthrough.prototype.speak = function (force) {
    var slide = this.slides[this.i];
    if (!slide) return;
    this.stopVoice();
    // Mute blocks autoplay only; Replay (force) always speaks when the student asks.
    if (this.muted && !force) return;

    var self = this;
    if (slide.audio) {
      var a = new Audio(slide.audio);
      this._audioEl = a;
      this.speaking.textContent = 'Playing…';
      a.onended = function () { self.speaking.textContent = ''; };
      a.onerror = function () { self.speaking.textContent = ''; self._tts(slide.voice || ''); };
      a.play().catch(function () { self._tts(slide.voice || ''); });
      return;
    }
    this._tts(slide.voice || '');
  };

  InteractiveWalkthrough.prototype._tts = function (text) {
    if (!text || !global.speechSynthesis) {
      this.speaking.textContent = '';
      return;
    }
    var self = this;
    var u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.pitch = 1;
    u.onstart = function () { self.speaking.textContent = 'Speaking…'; };
    u.onend = function () { self.speaking.textContent = ''; };
    u.onerror = function () { self.speaking.textContent = ''; };
    this._utter = u;
    speechSynthesis.speak(u);
  };

  InteractiveWalkthrough.prototype._show = function (index, skipVoice) {
    if (index < 0 || index >= this.slides.length) return;
    this.stopVoice();
    this.i = index;
    var slide = this.slides[this.i];
    var n = this.slides.length;
    this.progress.textContent = 'Step ' + (this.i + 1) + ' of ' + n;

    this.btnBack.disabled = this.i === 0;
    this.btnNext.disabled = this.i === n - 1;
    this.btnNext.textContent = this.i === n - 1 ? 'Done' : 'Next →';

    var accent = slide.accent || '#1a1a2e';
    var whyBg = slide.whyBg || '#ececf3';

    this.slideEl.classList.remove('iw-enter');
    void this.slideEl.offsetWidth;
    this.slideEl.classList.add('iw-enter');
    this.slideEl.style.setProperty('--accent', accent);
    this.slideEl.style.setProperty('--whybg', whyBg);
    this.slideEl.innerHTML = '';

    if (slide.kicker) {
      this.slideEl.appendChild(el('p', { className: 'iw-kicker', text: slide.kicker }));
    }

    var titleKids = [];
    if (slide.num != null) {
      titleKids.push(el('span', { className: 'iw-num', 'aria-hidden': 'true', text: String(slide.num) }));
    }
    titleKids.push(el('span', { html: slide.title || '' }));
    this.slideEl.appendChild(el('h2', { className: 'iw-title' }, titleKids));

    var body = el('div', { className: 'iw-body', html: slide.body || '' });
    this.slideEl.appendChild(body);

    if (slide.why) {
      this.slideEl.appendChild(el('aside', {
        className: 'iw-why',
        'aria-label': 'Why it works',
        html: '<h3>Why it works</h3>' + slide.why
      }));
    }

    var self = this;
    typeset(this.slideEl).then(function () {
      if (!skipVoice && self.autoplay) self.speak(false);
    });
  };

  InteractiveWalkthrough.prototype.next = function () {
    if (this.i < this.slides.length - 1) this._show(this.i + 1, false);
  };
  InteractiveWalkthrough.prototype.prev = function () {
    if (this.i > 0) this._show(this.i - 1, false);
  };

  InteractiveWalkthrough.mount = function (root, config) {
    return new InteractiveWalkthrough(root, config);
  };

  global.InteractiveWalkthrough = InteractiveWalkthrough;
})(typeof window !== 'undefined' ? window : this);
