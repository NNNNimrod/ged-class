/**
 * Interactive walkthrough player (shared shell).
 * Usage: InteractiveWalkthrough.mount(root, {
 *   problem, slides, choices, buildNotes, autoplay, muted, requireChoice
 * })
 *
 * Config:
 *   problem: HTML always shown in the Problem rail
 *   slides: array of slide objects
 *   choices: optional [{id, label, correct}] — choose-first gate (MC or FIB chips)
 *   choiceMode: 'single' (default) | 'multi' — multi = pick all correct chips then Check
 *   buildNotes: HTML/string shown in Build notes below nav (not in Why it works)
 *   requireChoice: if true (default when choices present), gate until Show walkthrough
 *
 * Slide fields:
 *   kind, kicker, title, num, accent, whyBg, body, why, voice, audio, work
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
    this.choices = (config && config.choices) || [];
    this.choiceMode = (config && config.choiceMode) || 'single';
    this.buildNotes = (config && config.buildNotes) || '';
    this.requireChoice = config && config.requireChoice != null
      ? !!config.requireChoice
      : this.choices.length > 0;
    this.i = 0;
    this.autoplay = config.autoplay !== false;
    this.muted = !!config.muted;
    this._audioEl = null;
    this._utter = null;
    // Gate: choosing → wrong | correct → open (walkthrough visible)
    this.gateState = this.requireChoice ? 'choosing' : 'open';
    this._selected = {}; // id → true
    this._build();
    this._applyGate();
    if (this.gateState === 'open') this._show(0, true);
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
    this.choiceMount = el('div', { id: 'iw-choice-mount', 'aria-label': 'Answer choices' });
    this.gateFeedback = el('div', { id: 'iw-gate-feedback', 'aria-live': 'polite' });
    var problemPanel = el('section', {
      id: 'iw-problem-panel',
      'aria-label': 'Original problem'
    }, [
      el('h2', { className: 'iw-panel-label', text: 'Problem' }),
      this.problemBody,
      this.choiceMount,
      this.gateFeedback
    ]);

    this.workEl = el('div', { id: 'iw-work', className: 'iw-work-empty', 'aria-live': 'polite' });
    this.workPanel = el('section', {
      id: 'iw-work-panel',
      'aria-label': 'Work so far'
    }, [
      el('h2', { className: 'iw-panel-label', text: 'Work so far' }),
      this.workEl
    ]);

    this.rail = el('aside', { id: 'iw-rail' }, [problemPanel, this.workPanel]);

    this.slideEl = el('div', { id: 'iw-slide', role: 'region', 'aria-live': 'polite' });
    this.gatePlaceholder = el('div', { id: 'iw-gate-placeholder' });
    this.stage = el('div', { id: 'iw-stage' }, [this.gatePlaceholder, this.slideEl]);

    var main = el('div', { id: 'iw-main' }, [this.rail, this.stage]);

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
    this.btnShowWalk = el('button', {
      type: 'button', id: 'iw-show-walk', className: 'iw-pill',
      text: 'Show walkthrough',
      onclick: function () { self._openWalkthrough(); }
    });
    this.nav = el('div', { id: 'iw-nav' }, [
      this.btnBack, this.btnReplay, this.speaking, this.btnShowWalk, this.btnNext
    ]);

    this.buildNotesEl = el('aside', {
      id: 'iw-build-notes',
      'aria-label': 'Build notes',
      html: this.buildNotes
        ? '<h3>Build notes</h3><div class="iw-build-notes-body">' + this.buildNotes + '</div>'
        : ''
    });
    if (!this.buildNotes) this.buildNotesEl.hidden = true;

    this.root.appendChild(top);
    this.root.appendChild(main);
    this.root.appendChild(this.nav);
    this.root.appendChild(this.buildNotesEl);

    this._renderChoices();

    document.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)) return;
      if (self.gateState !== 'open') return;
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

  InteractiveWalkthrough.prototype._renderChoices = function () {
    var self = this;
    this.choiceMount.innerHTML = '';
    if (!this.choices.length) {
      this.choiceMount.hidden = true;
      return;
    }
    this.choiceMount.hidden = false;
    var prompt = el('p', {
      className: 'iw-choice-prompt',
      text: this.choiceMode === 'multi'
        ? 'Try first — select every correct form, then Check.'
        : 'Try first — pick an answer before the walkthrough.'
    });
    var list = el('div', { className: 'iw-choice-list' + (this.choiceMode === 'multi' ? ' iw-choice-row' : ''), role: this.choiceMode === 'multi' ? 'group' : 'radiogroup' });
    this.choices.forEach(function (c) {
      var btn = el('button', {
        type: 'button',
        className: 'iw-choice-btn',
        'data-id': c.id,
        'aria-pressed': 'false',
        html: '<span class="iw-choice-id">' + (c.id || '') + '</span><span class="iw-choice-label">' + (c.label || '') + '</span>',
        onclick: function () { self._onChoiceClick(c.id); }
      });
      list.appendChild(btn);
    });
    this.choiceMount.appendChild(prompt);
    this.choiceMount.appendChild(list);
    if (this.choiceMode === 'multi') {
      this.btnCheck = el('button', {
        type: 'button',
        className: 'iw-pill iw-pill-check',
        text: 'Check',
        onclick: function () { self._checkMulti(); }
      });
      this.choiceMount.appendChild(this.btnCheck);
    }
    typeset(this.choiceMount);
  };

  InteractiveWalkthrough.prototype._onChoiceClick = function (id) {
    if (this.gateState === 'open') return; // lock after walkthrough opened? allow re-try before open
    if (this.gateState === 'correct') return; // already confirmed
    if (this.choiceMode === 'multi') {
      this._selected[id] = !this._selected[id];
      this._syncChoiceButtons();
      this.gateState = 'choosing';
      this.gateFeedback.innerHTML = '';
      this.gateFeedback.className = '';
      return;
    }
    // single
    this._selected = {};
    this._selected[id] = true;
    this._syncChoiceButtons();
    var choice = null;
    for (var i = 0; i < this.choices.length; i++) {
      if (this.choices[i].id === id) { choice = this.choices[i]; break; }
    }
    if (!choice) return;
    if (choice.correct) {
      this._setCorrect();
    } else {
      this._setWrong();
    }
  };

  InteractiveWalkthrough.prototype._checkMulti = function () {
    if (this.gateState === 'open' || this.gateState === 'correct') return;
    var ok = true;
    var any = false;
    for (var i = 0; i < this.choices.length; i++) {
      var c = this.choices[i];
      var sel = !!this._selected[c.id];
      if (sel) any = true;
      if (c.correct && !sel) ok = false;
      if (!c.correct && sel) ok = false;
    }
    if (!any) {
      this.gateFeedback.className = 'iw-gate-msg iw-gate-hint';
      this.gateFeedback.textContent = 'Select the forms you think are correct, then Check.';
      return;
    }
    if (ok) this._setCorrect();
    else this._setWrong();
  };

  InteractiveWalkthrough.prototype._syncChoiceButtons = function () {
    var self = this;
    var btns = this.choiceMount.querySelectorAll('.iw-choice-btn');
    btns.forEach(function (b) {
      var id = b.getAttribute('data-id');
      var on = !!self._selected[id];
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('iw-choice-selected', on);
      // Never mark correct/incorrect visually in a way that reveals the answer
      b.classList.remove('iw-choice-right', 'iw-choice-wrong-mark');
      if (self.gateState === 'wrong' && on) b.classList.add('iw-choice-wrong-mark');
      if (self.gateState === 'correct' && on) b.classList.add('iw-choice-right');
    });
  };

  InteractiveWalkthrough.prototype._setWrong = function () {
    this.gateState = 'wrong';
    this._syncChoiceButtons();
    this.gateFeedback.className = 'iw-gate-msg iw-gate-wrong';
    this.gateFeedback.innerHTML =
      '<strong>Not quite.</strong> Try another answer, or tap <em>Show walkthrough</em> when you want the steps.';
    // Do NOT highlight or name the correct choice
  };

  InteractiveWalkthrough.prototype._setCorrect = function () {
    var self = this;
    this.gateState = 'correct';
    this._syncChoiceButtons();
    this.gateFeedback.className = 'iw-gate-msg iw-gate-correct';
    this.gateFeedback.innerHTML = '';
    this.gateFeedback.appendChild(el('p', {
      html: '<strong>Nice work — that\'s right.</strong> You can stop here, or continue into the step-by-step walkthrough.'
    }));
    var row = el('div', { className: 'iw-gate-actions' });
    row.appendChild(el('button', {
      type: 'button', className: 'iw-pill iw-pill-continue',
      text: 'Continue to walkthrough',
      onclick: function () { self._openWalkthrough(); }
    }));
    row.appendChild(el('button', {
      type: 'button', className: 'iw-pill iw-pill-stop',
      text: 'Stop here',
      onclick: function () {
        self.gateFeedback.innerHTML =
          '<p class="iw-gate-msg iw-gate-correct"><strong>You\'re done.</strong> Tap <em>Show walkthrough</em> anytime if you want the steps later.</p>';
      }
    }));
    this.gateFeedback.appendChild(row);
  };

  InteractiveWalkthrough.prototype._openWalkthrough = function () {
    if (this.gateState === 'open') return;
    this.gateState = 'open';
    this._applyGate();
    this._show(0, false);
  };

  InteractiveWalkthrough.prototype._applyGate = function () {
    var open = this.gateState === 'open';
    this.root.classList.toggle('iw-gated', !open);
    this.root.classList.toggle('iw-open', open);
    this.workPanel.hidden = !open;
    this.slideEl.hidden = !open;
    this.btnBack.hidden = !open;
    this.btnReplay.hidden = !open;
    this.btnNext.hidden = !open;
    this.speaking.hidden = !open;
    this.btnShowWalk.hidden = open;
    this.progress.textContent = open
      ? this.progress.textContent
      : 'Try the problem first';

    if (!open) {
      this.stopVoice();
      this.gatePlaceholder.hidden = false;
      this.gatePlaceholder.innerHTML =
        '<div class="iw-gate-card">' +
        '<p class="iw-kicker">Choose first</p>' +
        '<h2 class="iw-title">Work the problem on your own</h2>' +
        '<p>Pick an answer in the <strong>Problem</strong> panel on the left. ' +
        'The step-by-step walkthrough and <strong>Work so far</strong> stay hidden until you tap ' +
        '<span class="iw-inline-pill">Show walkthrough</span>.</p>' +
        '<p style="color:var(--muted);font-size:.92em;margin-top:10px">Wrong answers are flagged only — we will not tip the correct choice.</p>' +
        '</div>';
    } else {
      this.gatePlaceholder.hidden = true;
      this.gatePlaceholder.innerHTML = '';
    }
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
    if (this.speaking) this.speaking.textContent = '';
  };

  InteractiveWalkthrough.prototype.speak = function (force) {
    if (this.gateState !== 'open') return;
    var slide = this.slides[this.i];
    if (!slide) return;
    this.stopVoice();
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
    if (this.gateState !== 'open') {
      this.workEl.classList.add('iw-work-empty');
      return Promise.resolve();
    }
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
    self.workEl.scrollTop = self.workEl.scrollHeight;
    return typeset(this.workEl);
  };

  InteractiveWalkthrough.prototype._show = function (index, skipVoice) {
    if (this.gateState !== 'open') return;
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
    if (this.gateState !== 'open') return;
    if (this.i < this.slides.length - 1) this._show(this.i + 1, false);
  };
  InteractiveWalkthrough.prototype.prev = function () {
    if (this.gateState !== 'open') return;
    if (this.i > 0) this._show(this.i - 1, false);
  };

  InteractiveWalkthrough.mount = function (root, config) {
    return new InteractiveWalkthrough(root, config);
  };

  global.InteractiveWalkthrough = InteractiveWalkthrough;
})(typeof window !== 'undefined' ? window : this);
