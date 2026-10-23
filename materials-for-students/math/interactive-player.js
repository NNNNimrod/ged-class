/**
 * Interactive walkthrough player (shared shell).
 * Usage: InteractiveWalkthrough.mount(root, { problem, slides, autoplay, muted })
 *
 * Config:
 *   problem: HTML always shown in the Problem rail (required for useful UX)
 *   slides: array of slide objects
 *
 * Slide fields:
 *   kind: 'title' | 'step' | 'answer'
 *   kicker, title, num, accent, whyBg, body, why, voice, audio
 *   work: optional HTML snippet appended to the "Work so far" strip when this
 *         slide is reached (and kept for later slides). Omit on title slides.
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

  function resolveProblem(config) {
    if (config.problem) return config.problem;
    var slides = config.slides || [];
    for (var i = 0; i < slides.length; i++) {
      if (slides[i].problem) return slides[i].problem;
    }
    return '';
  }

  function InteractiveWalkthrough(root, config) {
    this.root = root;
    this.slides = (config && config.slides) || [];
    this.problemHtml = resolveProblem(config || {});
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

    this.problemBody = el('div', { id: 'iw-problem-body', html: this.problemHtml || '<p><em>No problem text provided.</em></p>' });
    var problemPanel = el('section', {
      id: 'iw-problem-panel',
      'aria-label': 'Original problem'
    }, [
      el('h2', { className: 'iw-panel-label', text: 'Problem' }),
      this.problemBody
    ]);

    this.workEl = el('div', { id: 'iw-work', className: 'iw-work-empty', 'aria-live': 'polite' });
    var workPanel = el('section', {
      id: 'iw-work-panel',
      'aria-label': 'Work so far'
    }, [
      el('h2', { className: 'iw-panel-label', text: 'Work so far' }),
      this.workEl
    ]);

    this.rail = el('aside', { id: 'iw-rail' }, [problemPanel, workPanel]);

    this.slideEl = el('div', { id: 'iw-slide', role: 'region', 'aria-live': 'polite' });
    var stage = el('div', { id: 'iw-stage' }, [this.slideEl]);

    var main = el('div', { id: 'iw-main' }, [this.rail, stage]);

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
    this.root.appendChild(main);
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

  InteractiveWalkthrough.prototype._renderWork = function () {
    var self = this;
    this.workEl.innerHTML = '';
    var lines = [];
    for (var i = 0; i <= this.i; i++) {
      var s = this.slides[i];
      var w = s.work || s.scratch;
      if (!s || !w) continue;
      lines.push({ index: i, slide: s, html: w });
    }
    if (!lines.length) {
      this.workEl.classList.add('iw-work-empty');
      return Promise.resolve();
    }
    this.workEl.classList.remove('iw-work-empty');
    lines.forEach(function (line, li) {
      var isCurrent = line.index === self.i;
      var label = line.slide.num != null ? String(line.slide.num) : String(li + 1);
      var row = el('div', {
        className: 'iw-work-line' + (isCurrent ? ' iw-work-current' : '')
      }, [
        el('span', { className: 'iw-work-n', 'aria-hidden': 'true', text: label }),
        el('div', { className: 'iw-work-html', html: line.html })
      ]);
      self.workEl.appendChild(row);
    });
    // Keep newest work in view
    self.workEl.scrollTop = self.workEl.scrollHeight;
    return typeset(this.workEl);
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
    Promise.all([typeset(this.slideEl), this._renderWork(), typeset(this.problemBody)]).then(function () {
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
