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
 *
 * Standing rules (required for every interactive page):
 *   INTERACTIVE_WALKTHROUGH_STANDING_RULES.md (same folder)
 *
 * Voice: every utterance passes through speakMath() so 4x → "four x", 0.4 → "zero point four", choice A → "choice ay", etc.
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

  /**
   * Normalize math-ish text for Web Speech so "4x" is "four x", not "x times".
   * On-screen math is unchanged; only the spoken string is rewritten.
   */
  function speakMath(text) {
    if (!text) return '';
    var s = String(text);

    var ones = ['zero','one','two','three','four','five','six','seven','eight','nine',
      'ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
    var tens = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];

    function numWords(n) {
      n = Math.abs(parseInt(n, 10));
      if (isNaN(n)) return String(n);
      if (n < 20) return ones[n];
      if (n < 100) {
        var t = Math.floor(n / 10), o = n % 10;
        return tens[t] + (o ? '-' + ones[o] : '');
      }
      if (n < 1000) {
        var h = Math.floor(n / 100), r = n % 100;
        return ones[h] + ' hundred' + (r ? ' ' + numWords(r) : '');
      }
      return String(n);
    }

    function digitWords(str) {
      return String(str).split('').map(function (d) {
        return ones[parseInt(d, 10)] || d;
      }).join(' ');
    }

    // Strip simple HTML if a caller ever passes markup
    s = s.replace(/<[^>]+>/g, ' ');

    // Percents: 40% / 40 %
    s = s.replace(/(\d+)\s*%/g, function (_, n) { return numWords(n) + ' percent'; });

    // Decimals: 0.4 → zero point four (digit-by-digit after the point)
    s = s.replace(/\b(\d+)\.(\d+)\b/g, function (_, whole, frac) {
      return numWords(whole) + ' point ' + digitWords(frac);
    });

    // Fractions a/b (not dates): 20/50, 2/5
    s = s.replace(/\b(\d+)\s*\/\s*(\d+)\b/g, function (_, a, b) {
      return numWords(a) + ' over ' + numWords(b);
    });

    // Signed term glued to a variable: -4x, −4x, +6y
    s = s.replace(/([−\-])(\d+)([a-zA-Z])\b/g, function (_, sign, digs, letter) {
      return ' negative ' + numWords(digs) + ' ' + letter.toLowerCase();
    });
    s = s.replace(/\+(\d+)([a-zA-Z])\b/g, function (_, digs, letter) {
      return ' plus ' + numWords(digs) + ' ' + letter.toLowerCase();
    });

    // "negative 4x" / "minus 4x" / "plus 4x" (words already present)
    s = s.replace(/\b(negative|minus|plus)\s+(\d+)([a-zA-Z])\b/gi, function (_, word, digs, letter) {
      return word.toLowerCase() + ' ' + numWords(digs) + ' ' + letter.toLowerCase();
    });

    // Bare coefficient×variable: 4x, 6y, 12x (avoid matching mid-word)
    s = s.replace(/(^|[^a-zA-Z0-9])(\d+)([a-zA-Z])\b/g, function (_, pre, digs, letter) {
      return pre + numWords(digs) + ' ' + letter.toLowerCase();
    });

    // Parentheses cues often written as (x+3)
    s = s.replace(/\(\s*/g, ' open parenthesis ');
    s = s.replace(/\s*\)/g, ' close parenthesis ');

    // Remaining bare integers → words (Step 4 → Step four; minus 6 → minus six)
    s = s.replace(/\b(\d+)\b/g, function (_, n) { return numWords(n); });

    // Letter names: capital A must be "ay" (never schwa "uh"). Don't touch article "a" or mid-word.
    // Phrases first, then bare standalone A / B / C / D as choice letters.
    s = s.replace(/\b(choice|answer|option|letter|pick|matches?)\s+A\b/gi, function (_, w) {
      return w + ' ay';
    });
    s = s.replace(/\bA\s+through\s+D\b/gi, 'ay through dee');
    s = s.replace(/\bA\s+and\s+B\b/gi, 'ay and bee');
    s = s.replace(/\bA\s*,\s*B\s*,\s*C\b/gi, 'ay, bee, see');
    s = s.replace(/\b([ABCD])\b/g, function (_, L) {
      return ({ A: 'ay', B: 'bee', C: 'see', D: 'dee' })[L] || L;
    });

    // Collapse whitespace
    s = s.replace(/\s+/g, ' ').trim();
    return s;
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
    this._maxVisited = 0; // highest slide index reached (work strip stays clickable)
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
        html: (function () {
          var id = c.id || '';
          // Show letter tags only for MC (A–D). Hide internal FIB ids like f1/d1/p1.
          var showId = /^[A-Da-d]$/.test(id);
          return (showId ? '<span class="iw-choice-id">' + id.toUpperCase() + '</span>' : '') +
            '<span class="iw-choice-label">' + (c.label || '') + '</span>';
        })(),
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
    var spoken = speakMath(text);
    var u = new SpeechSynthesisUtterance(spoken);
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
    var upto = Math.max(this._maxVisited || 0, this.i);
    for (var i = 0; i <= upto; i++) {
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
      var row = el('button', {
        type: 'button',
        className: 'iw-work-line' + (isCurrent ? ' iw-work-current' : ''),
        'data-slide-index': String(line.index),
        'aria-label': 'Go to step ' + label,
        'aria-current': isCurrent ? 'step' : null,
        title: 'Jump to this step',
        onclick: function () {
          if (self.gateState !== 'open') return;
          // skipVoice=false so auto-voice plays when enabled
          self._show(line.index, false);
        }
      }, [
        el('span', { className: 'iw-work-n', 'aria-hidden': 'true', text: label }),
        el('div', { className: 'iw-work-html', html: line.html })
      ]);
      self.workEl.appendChild(row);
    });
    // Keep current work line in view (not only newest)
    var cur = self.workEl.querySelector('.iw-work-current');
    if (cur && cur.scrollIntoView) {
      try { cur.scrollIntoView({ block: 'nearest' }); } catch (e) { self.workEl.scrollTop = cur.offsetTop; }
    } else {
      self.workEl.scrollTop = self.workEl.scrollHeight;
    }
    return typeset(this.workEl);
  };

  InteractiveWalkthrough.prototype._show = function (index, skipVoice) {
    if (this.gateState !== 'open') return;
    if (index < 0 || index >= this.slides.length) return;
    this.stopVoice();
    this.i = index;
    this._maxVisited = Math.max(this._maxVisited || 0, index);
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


  /**
   * SVG: branching arrows from a front factor to each inside term (distribute standard).
   * opts: { factorHtml, factorClass, terms: [{ html, termClass }] }
   * Colors come from .iw-term-* on the labels; arrow strokes match term classes.
   */
  var TERM_STROKE = {
    'iw-term-a': '#7a3fb3', 'iw-term-b': '#1d4ed8', 'iw-term-c': '#0f7a3d',
    'iw-term-d': '#0e6e7a', 'iw-term-e': '#a35a00', 'iw-term-f': '#b42318',
    'iw-term-fav': '#0f7a3d', 'iw-term-tot': '#1d4ed8', 'iw-term-dec': '#a35a00', 'iw-term-pct': '#9b1c5a'
  };

  function distributeArrows(opts) {
    opts = opts || {};
    var terms = opts.terms || [];
    var n = Math.max(terms.length, 1);
    var W = 340, H = 118;
    var fx = 70, fy = 24;
    var y2 = 92;
    var gap = Math.min(120, (W - 40) / n);
    var startX = (W - gap * (n - 1)) / 2;
    var fClass = opts.factorClass || 'iw-term-a';
    var fStroke = TERM_STROKE[fClass] || '#7a3fb3';
    var paths = '';
    var labels = '';
    for (var i = 0; i < n; i++) {
      var tx = startX + i * gap;
      var tc = terms[i].termClass || 'iw-term-b';
      var stroke = TERM_STROKE[tc] || '#1d4ed8';
      // quadratic curve from factor down to term
      var cpx = (fx + tx) / 2;
      var cpy = 50;
      paths += '<path d="M' + fx + ' ' + (fy + 18) + ' Q' + cpx + ' ' + cpy + ' ' + tx + ' ' + (y2 - 16) +
        '" fill="none" stroke="' + stroke + '" stroke-width="2.6" stroke-linecap="round"/>';
      paths += '<path d="M' + (tx - 6) + ' ' + (y2 - 26) + ' L' + tx + ' ' + (y2 - 16) + ' L' + (tx + 6) + ' ' + (y2 - 26) +
        '" fill="none" stroke="' + stroke + '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>';
      labels += '<foreignObject x="' + (tx - 36) + '" y="' + (y2 - 12) + '" width="72" height="28">' +
        '<div xmlns="http://www.w3.org/1999/xhtml" style="text-align:center;font:700 15px system-ui,sans-serif">' +
        '<span class="iw-term ' + tc + '">' + (terms[i].html || '') + '</span></div></foreignObject>';
    }
    var factorLabel = '<foreignObject x="' + (fx - 40) + '" y="2" width="80" height="28">' +
      '<div xmlns="http://www.w3.org/1999/xhtml" style="text-align:center;font:700 15px system-ui,sans-serif">' +
      '<span class="iw-term ' + fClass + '">' + (opts.factorHtml || '') + '</span></div></foreignObject>';
    return '<div class="iw-distribute" aria-hidden="true"><svg viewBox="0 0 ' + W + ' ' + H + '" width="340" height="118">' +
      factorLabel + paths + labels + '</svg></div>';
  }

  InteractiveWalkthrough.mount = function (root, config) {
    return new InteractiveWalkthrough(root, config);
  };
  InteractiveWalkthrough.speakMath = speakMath;
  InteractiveWalkthrough.distributeArrows = distributeArrows;

  global.InteractiveWalkthrough = InteractiveWalkthrough;
})(typeof window !== 'undefined' ? window : this);
