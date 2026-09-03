(function () {
  "use strict";

  var STORAGE = {
    snippets: "tanabata.copy.snippets.v1",
    beam: "tanabata.beam.inputs.v1",
    beamSaves: "tanabata.beam.saves.v1",
    floor: "tanabata.floor.inputs.v1",
    floorPatterns: "tanabata.floor.patterns.v1"
  };
  var BEAM_DEFAULTS = {
    floorHeightFl: "3650",
    sleeveCenterFl: "2880",
    beamDepth: "700",
    bottomFukashi: "0",
    slabTopLevel: "-270"
  };
  var FLOOR_DEFAULTS = {
    riseHeight: "100",
    slabThickness: "150"
  };
  var PATTERN_OPTIONS = [
    { id: "diag-45", name: "右上がり斜線" },
    { id: "diag-45-dense", name: "右上がり斜線 密" },
    { id: "diag-45-wide", name: "右上がり斜線 粗" },
    { id: "diag-135", name: "左上がり斜線" },
    { id: "diag-double", name: "二重斜線" },
    { id: "diag-triple", name: "三重斜線" },
    { id: "h-line", name: "横線" },
    { id: "h-line-dense", name: "横線 密" },
    { id: "v-line", name: "縦線" },
    { id: "v-line-dense", name: "縦線 密" },
    { id: "grid", name: "格子" },
    { id: "grid-dense", name: "格子 密" },
    { id: "diag-grid", name: "斜め格子" },
    { id: "dot-small", name: "小ドット" },
    { id: "dot-large", name: "大ドット" },
    { id: "dot-stagger", name: "千鳥ドット" },
    { id: "dash-h", name: "横破線" },
    { id: "dash-v", name: "縦破線" },
    { id: "dash-diag", name: "斜め破線" },
    { id: "dot-diag", name: "斜線+ドット" },
    { id: "dot-grid", name: "格子+ドット" },
    { id: "square", name: "正方形" },
    { id: "brick", name: "馬目地" }
  ];

  var snippets = readJson(STORAGE.snippets, []);
  var beamSaves = readJson(STORAGE.beamSaves, []);
  var floorPatterns = readJson(STORAGE.floorPatterns, []);
  var selectedFloorPatternId = PATTERN_OPTIONS[0].id;
  var editingId = null;
  var dragState = null;
  var toastTimer = null;

  var tabs = document.querySelectorAll(".tab");
  var views = document.querySelectorAll(".tool-view");
  var snippetForm = document.getElementById("snippet-form");
  var snippetText = document.getElementById("snippet-text");
  var snippetList = document.getElementById("snippet-list");
  var snippetCount = document.getElementById("snippet-count");
  var editDialog = document.getElementById("edit-dialog");
  var editForm = document.getElementById("edit-form");
  var editText = document.getElementById("edit-text");
  var editClose = document.getElementById("edit-close");
  var editCancel = document.getElementById("edit-cancel");
  var toast = document.getElementById("toast");
  var beamSaveButton = document.getElementById("beam-save");
  var beamResetButton = document.getElementById("beam-reset");
  var beamSaveList = document.getElementById("beam-save-list");
  var beamSaveCount = document.getElementById("beam-save-count");
  var clearButtons = document.querySelectorAll("[data-clear-field]");

  var beamFields = {
    sleeveCenterFl: document.getElementById("sleeve-center-fl"),
    floorHeightFl: document.getElementById("floor-height-fl"),
    beamDepth: document.getElementById("beam-depth"),
    bottomFukashi: document.getElementById("bottom-fukashi"),
    slabTopLevel: document.getElementById("slab-top-level")
  };
  var beamResult = document.getElementById("beam-result");
  var beamCopy = document.getElementById("beam-copy");
  var beamBottomFl = document.getElementById("beam-bottom-fl");
  var beamCenterFl = document.getElementById("beam-center-fl");
  var floorFields = {
    riseHeight: document.getElementById("floor-rise-height"),
    slabThickness: document.getElementById("floor-slab-thickness")
  };
  var floorResult = document.getElementById("floor-result");
  var floorCopy = document.getElementById("floor-copy");
  var floorDetailSlab = document.getElementById("floor-detail-slab");
  var floorDetailRise = document.getElementById("floor-detail-rise");
  var floorPatternOptions = document.getElementById("floor-pattern-options");
  var floorPatternForm = document.getElementById("floor-pattern-form");
  var floorPatternLabel = document.getElementById("floor-pattern-label");
  var floorPatternThickness = document.getElementById("floor-pattern-thickness");
  var floorPatternReset = document.getElementById("floor-pattern-reset");
  var floorSelectedPattern = document.getElementById("floor-selected-pattern");
  var floorSelectedPatternName = document.getElementById("floor-selected-pattern-name");
  var floorPatternList = document.getElementById("floor-pattern-list");
  var floorPatternCount = document.getElementById("floor-pattern-count");

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      setActiveTab(tab.dataset.tab);
    });
  });

  snippetForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var text = snippetText.value.trim();
    if (!text) {
      showToast("文字を入力してください");
      return;
    }

    snippets.unshift({
      id: createId(),
      text: text,
      createdAt: Date.now()
    });
    snippetText.value = "";
    saveSnippets();
    renderSnippets();
    showToast("追加しました");
  });

  snippetList.addEventListener("click", function (event) {
    var action = event.target.closest("[data-action]");
    var card = event.target.closest(".snippet-card");
    if (!card) {
      return;
    }
    if (event.target.closest(".drag-handle")) {
      return;
    }

    var id = card.dataset.id;
    if (action) {
      event.stopPropagation();
      if (action.dataset.action === "edit") {
        openEdit(id);
      }
      if (action.dataset.action === "delete") {
        deleteSnippet(id);
      }
      return;
    }

    var snippet = findSnippet(id);
    if (snippet) {
      copyText(snippet.text, "コピーしました");
    }
  });

  snippetList.addEventListener("pointerdown", function (event) {
    var handle = event.target.closest(".drag-handle");
    if (!handle) {
      return;
    }

    var card = event.target.closest(".snippet-card");
    if (!card) {
      return;
    }

    event.preventDefault();
    dragState = {
      id: card.dataset.id,
      pointerId: event.pointerId,
      startIds: getSnippetOrder()
    };
    card.classList.add("is-dragging");
    snippetList.classList.add("is-sorting");
    handle.setPointerCapture(event.pointerId);
  });

  snippetList.addEventListener("pointermove", function (event) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }

    var card = snippetList.querySelector('[data-id="' + dragState.id + '"]');
    if (!card) {
      return;
    }

    event.preventDefault();
    var target = getReorderTarget(event.clientY, card);
    if (target) {
      snippetList.insertBefore(card, target);
    } else {
      snippetList.appendChild(card);
    }
  });

  snippetList.addEventListener("pointerup", finishDrag);
  snippetList.addEventListener("pointercancel", finishDrag);
  window.addEventListener("pointerup", finishDrag);
  window.addEventListener("pointercancel", finishDrag);

  editForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var text = editText.value.trim();
    if (!editingId || !text) {
      showToast("文字を入力してください");
      return;
    }

    snippets = snippets.map(function (snippet) {
      if (snippet.id !== editingId) {
        return snippet;
      }
      return {
        id: snippet.id,
        text: text,
        createdAt: snippet.createdAt,
        updatedAt: Date.now()
      };
    });
    saveSnippets();
    closeEdit();
    renderSnippets();
    showToast("保存しました");
  });

  editClose.addEventListener("click", closeEdit);
  editCancel.addEventListener("click", closeEdit);

  Object.keys(beamFields).forEach(function (key) {
    beamFields[key].addEventListener("input", function () {
      normalizeBeamField(beamFields[key], false);
      saveBeamInputs();
      renderBeam();
    });
    beamFields[key].addEventListener("blur", function () {
      normalizeBeamField(beamFields[key], true);
      saveBeamInputs();
      renderBeam();
    });
  });

  Object.keys(floorFields).forEach(function (key) {
    floorFields[key].addEventListener("input", function () {
      normalizeBeamField(floorFields[key], false);
      saveFloorInputs();
      renderFloor();
    });
    floorFields[key].addEventListener("blur", function () {
      normalizeBeamField(floorFields[key], true);
      saveFloorInputs();
      renderFloor();
    });
  });

  floorPatternThickness.addEventListener("input", function () {
    normalizeBeamField(floorPatternThickness, false);
  });
  floorPatternThickness.addEventListener("blur", function () {
    normalizeBeamField(floorPatternThickness, true);
  });

  clearButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      var field = document.getElementById(button.dataset.clearField);
      if (!field) {
        return;
      }
      field.value = "0";
      if (isFloorField(field)) {
        saveFloorInputs();
        renderFloor();
      } else if (field === floorPatternThickness) {
        normalizeBeamField(floorPatternThickness, true);
      } else {
        saveBeamInputs();
        renderBeam();
      }
      field.focus();
    });
  });

  beamCopy.addEventListener("click", function () {
    if (!beamCopy.disabled) {
      copyText(beamResult.textContent, "コピーしました");
    }
  });

  beamSaveButton.addEventListener("click", saveBeamRecord);
  beamResetButton.addEventListener("click", resetBeamFields);

  floorCopy.addEventListener("click", function () {
    if (!floorCopy.disabled) {
      copyText(floorResult.textContent, "コピーしました");
    }
  });

  floorPatternOptions.addEventListener("click", function (event) {
    var option = event.target.closest("[data-pattern-option]");
    if (!option) {
      return;
    }
    selectFloorPattern(option.dataset.patternOption);
  });

  floorPatternForm.addEventListener("submit", function (event) {
    event.preventDefault();
    saveFloorPattern();
  });

  floorPatternReset.addEventListener("click", function () {
    floorPatternLabel.value = "";
    floorPatternThickness.value = "0";
    floorPatternLabel.focus();
  });

  floorPatternList.addEventListener("click", function (event) {
    var action = event.target.closest("[data-action]");
    var card = event.target.closest("[data-id]");
    if (!card) {
      return;
    }
    if (action && action.dataset.action === "delete-floor-pattern") {
      event.stopPropagation();
      deleteFloorPattern(card.dataset.id);
      return;
    }
    applyFloorPattern(card.dataset.id);
  });

  beamSaveList.addEventListener("click", function (event) {
    var action = event.target.closest("[data-action]");
    var card = event.target.closest("[data-id]");
    if (!action || !card) {
      return;
    }

    var id = card.dataset.id;
    if (action.dataset.action === "restore-beam") {
      restoreBeamRecord(id);
    }
    if (action.dataset.action === "delete-beam") {
      deleteBeamRecord(id);
    }
  });

  loadBeamInputs();
  loadFloorInputs();
  renderFloorPatternOptions();
  selectFloorPattern(selectedFloorPatternId);
  renderSnippets();
  renderBeam();
  renderBeamSaves();
  renderFloor();
  renderFloorPatterns();

  function setActiveTab(name) {
    tabs.forEach(function (tab) {
      tab.classList.toggle("is-active", tab.dataset.tab === name);
    });
    views.forEach(function (view) {
      view.classList.toggle("is-active", view.id === name);
    });
  }

  function renderSnippets() {
    snippetCount.textContent = snippets.length + "件";
    snippetList.innerHTML = "";

    if (snippets.length === 0) {
      var empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "まだ登録なし";
      snippetList.appendChild(empty);
      return;
    }

    snippets.forEach(function (snippet) {
      var card = document.createElement("article");
      card.className = "snippet-card";
      card.dataset.id = snippet.id;

      var handle = document.createElement("button");
      handle.className = "icon-button drag-handle";
      handle.type = "button";
      handle.setAttribute("aria-label", "並び替え");
      handle.title = "ドラッグして並び替え";
      handle.textContent = "≡";
      handle.disabled = snippets.length < 2;
      if (handle.disabled) {
        handle.title = "2件以上で並び替えできます";
      }

      var text = document.createElement("p");
      text.className = "snippet-text";
      text.textContent = snippet.text;

      var actions = document.createElement("div");
      actions.className = "card-actions";

      var edit = document.createElement("button");
      edit.className = "icon-button";
      edit.type = "button";
      edit.dataset.action = "edit";
      edit.setAttribute("aria-label", "編集");
      edit.textContent = "✎";

      var remove = document.createElement("button");
      remove.className = "icon-button is-danger";
      remove.type = "button";
      remove.dataset.action = "delete";
      remove.setAttribute("aria-label", "削除");
      remove.textContent = "×";

      actions.appendChild(edit);
      actions.appendChild(remove);
      card.appendChild(handle);
      card.appendChild(text);
      card.appendChild(actions);
      snippetList.appendChild(card);
    });
  }

  function openEdit(id) {
    var snippet = findSnippet(id);
    if (!snippet) {
      return;
    }
    editingId = id;
    editText.value = snippet.text;
    if (typeof editDialog.showModal === "function") {
      editDialog.showModal();
    } else {
      editDialog.setAttribute("open", "open");
    }
    editText.focus();
  }

  function closeEdit() {
    editingId = null;
    if (editDialog.open && typeof editDialog.close === "function") {
      editDialog.close();
    } else {
      editDialog.removeAttribute("open");
    }
  }

  function deleteSnippet(id) {
    snippets = snippets.filter(function (snippet) {
      return snippet.id !== id;
    });
    saveSnippets();
    renderSnippets();
    showToast("削除しました");
  }

  function finishDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }

    var card = snippetList.querySelector('[data-id="' + dragState.id + '"]');
    if (card) {
      card.classList.remove("is-dragging");
    }
    snippetList.classList.remove("is-sorting");

    var ids = getSnippetOrder();
    var changed = dragState.startIds.join("|") !== ids.join("|");

    if (ids.length && changed) {
      snippets = ids.map(findSnippet).filter(Boolean);
      saveSnippets();
      renderSnippets();
      showToast("並び替えました");
    }

    dragState = null;
  }

  function getSnippetOrder() {
    return Array.prototype.map.call(snippetList.querySelectorAll(".snippet-card"), function (node) {
      return node.dataset.id;
    });
  }

  function getReorderTarget(y, draggingCard) {
    var cards = Array.prototype.filter.call(snippetList.querySelectorAll(".snippet-card"), function (card) {
      return card !== draggingCard;
    });
    var closest = {
      offset: Number.NEGATIVE_INFINITY,
      element: null
    };

    cards.forEach(function (card) {
      var box = card.getBoundingClientRect();
      var offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        closest = {
          offset: offset,
          element: card
        };
      }
    });

    return closest.element;
  }

  function findSnippet(id) {
    return snippets.find(function (snippet) {
      return snippet.id === id;
    });
  }

  function saveSnippets() {
    writeJson(STORAGE.snippets, snippets);
  }

  function loadBeamInputs() {
    var saved = readJson(STORAGE.beam, {});
    Object.keys(beamFields).forEach(function (key) {
      if (saved[key] !== undefined) {
        beamFields[key].value = normalizeNumericText(saved[key]) || "0";
        return;
      }
      if (BEAM_DEFAULTS[key] !== undefined) {
        beamFields[key].value = BEAM_DEFAULTS[key];
      }
    });
  }

  function saveBeamInputs() {
    var values = {};
    Object.keys(beamFields).forEach(function (key) {
      values[key] = numericValueForStorage(beamFields[key].value);
    });
    writeJson(STORAGE.beam, values);
  }

  function loadFloorInputs() {
    var saved = readJson(STORAGE.floor, {});
    Object.keys(floorFields).forEach(function (key) {
      if (saved[key] !== undefined) {
        floorFields[key].value = normalizeNumericText(saved[key]) || "0";
        return;
      }
      if (FLOOR_DEFAULTS[key] !== undefined) {
        floorFields[key].value = FLOOR_DEFAULTS[key];
      }
    });
  }

  function saveFloorInputs() {
    var values = {};
    Object.keys(floorFields).forEach(function (key) {
      values[key] = numericValueForStorage(floorFields[key].value);
    });
    writeJson(STORAGE.floor, values);
  }

  function renderFloor() {
    var values = {
      riseHeight: toNumber(floorFields.riseHeight.value),
      slabThickness: toNumber(floorFields.slabThickness.value)
    };
    var length = values.riseHeight + values.slabThickness;

    floorResult.textContent = "L=" + formatMm(length);
    floorDetailSlab.textContent = formatMm(values.slabThickness);
    floorDetailRise.textContent = formatMm(values.riseHeight);
    floorCopy.disabled = false;
  }

  function renderFloorPatternOptions() {
    floorPatternOptions.innerHTML = "";
    PATTERN_OPTIONS.forEach(function (pattern) {
      var button = document.createElement("button");
      button.className = "pattern-option";
      button.type = "button";
      button.dataset.patternOption = pattern.id;

      var swatch = document.createElement("span");
      swatch.className = "pattern-swatch";
      swatch.dataset.pattern = pattern.id;

      var name = document.createElement("span");
      name.className = "pattern-name";
      name.textContent = pattern.name;

      button.appendChild(swatch);
      button.appendChild(name);
      floorPatternOptions.appendChild(button);
    });
  }

  function selectFloorPattern(id) {
    var pattern = getPatternOption(id) || PATTERN_OPTIONS[0];
    selectedFloorPatternId = pattern.id;
    floorSelectedPattern.dataset.pattern = pattern.id;
    floorSelectedPatternName.textContent = pattern.name;
    if (!floorPatternLabel.value.trim()) {
      floorPatternLabel.value = pattern.name;
    }
    Array.prototype.forEach.call(floorPatternOptions.querySelectorAll("[data-pattern-option]"), function (option) {
      option.classList.toggle("is-selected", option.dataset.patternOption === pattern.id);
    });
  }

  function saveFloorPattern() {
    var label = floorPatternLabel.value.trim();
    normalizeBeamField(floorPatternThickness, true);
    var thickness = numericValueForStorage(floorPatternThickness.value);
    var pattern = getPatternOption(selectedFloorPatternId) || PATTERN_OPTIONS[0];

    if (!label) {
      label = pattern.name;
      floorPatternLabel.value = label;
    }
    if (toNumber(thickness) <= 0) {
      showToast("スラブ厚を入力してください");
      floorPatternThickness.focus();
      return;
    }

    floorPatterns.unshift({
      id: createId(),
      patternId: pattern.id,
      patternName: pattern.name,
      label: label,
      thickness: thickness,
      createdAt: Date.now()
    });
    writeJson(STORAGE.floorPatterns, floorPatterns);
    renderFloorPatterns();
    showToast("登録しました");
  }

  function renderFloorPatterns() {
    floorPatternCount.textContent = floorPatterns.length + "件";
    floorPatternList.innerHTML = "";

    if (floorPatterns.length === 0) {
      var empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "まだ登録なし。下の柄を選んでスラブ厚を登録してください";
      floorPatternList.appendChild(empty);
      return;
    }

    floorPatterns.forEach(function (record) {
      var pattern = getPatternOption(record.patternId) || {
        id: "diag-45",
        name: record.patternName || "柄"
      };
      var card = document.createElement("article");
      card.className = "slab-card";
      card.dataset.id = record.id;

      var swatch = document.createElement("span");
      swatch.className = "pattern-swatch";
      swatch.dataset.pattern = pattern.id;

      var body = document.createElement("div");
      body.className = "card-body";

      var label = document.createElement("p");
      label.className = "slab-card-name";
      label.textContent = record.label || pattern.name;

      var thickness = document.createElement("p");
      thickness.className = "slab-card-thickness";
      thickness.textContent = formatMm(toNumber(record.thickness));

      var patternName = document.createElement("p");
      patternName.className = "slab-card-pattern";
      patternName.textContent = pattern.name;

      var actions = document.createElement("div");
      actions.className = "slab-card-actions";

      var remove = document.createElement("button");
      remove.className = "icon-button is-danger";
      remove.type = "button";
      remove.dataset.action = "delete-floor-pattern";
      remove.setAttribute("aria-label", "削除");
      remove.textContent = "×";

      body.appendChild(label);
      body.appendChild(thickness);
      body.appendChild(patternName);
      actions.appendChild(remove);
      card.appendChild(swatch);
      card.appendChild(body);
      card.appendChild(actions);
      floorPatternList.appendChild(card);
    });
  }

  function applyFloorPattern(id) {
    var record = floorPatterns.find(function (item) {
      return item.id === id;
    });
    if (!record) {
      return;
    }
    floorFields.slabThickness.value = numericValueForStorage(record.thickness);
    saveFloorInputs();
    renderFloor();
    showToast("スラブ厚へ反映しました");
  }

  function deleteFloorPattern(id) {
    floorPatterns = floorPatterns.filter(function (item) {
      return item.id !== id;
    });
    writeJson(STORAGE.floorPatterns, floorPatterns);
    renderFloorPatterns();
    showToast("削除しました");
  }

  function renderBeam() {
    var values = {
      sleeveCenterFl: toNumber(beamFields.sleeveCenterFl.value),
      floorHeightFl: toNumber(beamFields.floorHeightFl.value),
      beamDepth: toNumber(beamFields.beamDepth.value),
      bottomFukashi: toNumber(beamFields.bottomFukashi.value),
      slabTopLevel: toNumber(beamFields.slabTopLevel.value)
    };

    var bottomFl = values.floorHeightFl - values.beamDepth - values.bottomFukashi + values.slabTopLevel;
    var distance = values.sleeveCenterFl - bottomFl;
    var result = formatBeamDistance(distance);

    beamResult.textContent = result;
    beamBottomFl.textContent = formatMm(bottomFl);
    beamCenterFl.textContent = formatMm(values.sleeveCenterFl);
    beamCopy.disabled = false;
  }

  function saveBeamRecord() {
    var values = getBeamStorageValues();
    var numeric = {
      sleeveCenterFl: toNumber(values.sleeveCenterFl),
      floorHeightFl: toNumber(values.floorHeightFl),
      beamDepth: toNumber(values.beamDepth),
      bottomFukashi: toNumber(values.bottomFukashi),
      slabTopLevel: toNumber(values.slabTopLevel)
    };
    var bottomFl = numeric.floorHeightFl - numeric.beamDepth - numeric.bottomFukashi + numeric.slabTopLevel;
    var result = formatBeamDistance(numeric.sleeveCenterFl - bottomFl);

    beamSaves.unshift({
      id: createId(),
      savedAt: Date.now(),
      result: result,
      bottomFl: bottomFl,
      values: values
    });
    writeJson(STORAGE.beamSaves, beamSaves);
    renderBeamSaves();
    showToast("保存しました");
  }

  function resetBeamFields() {
    Object.keys(beamFields).forEach(function (key) {
      beamFields[key].value = "0";
    });
    saveBeamInputs();
    renderBeam();
    showToast("リセットしました");
  }

  function renderBeamSaves() {
    beamSaveCount.textContent = beamSaves.length + "件";
    beamSaveList.innerHTML = "";

    if (beamSaves.length === 0) {
      var empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "まだ保存なし";
      beamSaveList.appendChild(empty);
      return;
    }

    beamSaves.forEach(function (record) {
      var card = document.createElement("article");
      card.className = "snippet-card no-handle";
      card.dataset.id = record.id;

      var body = document.createElement("div");
      body.className = "card-body";

      var meta = document.createElement("p");
      meta.className = "card-meta";
      meta.textContent = formatDate(record.savedAt || Date.now());

      var preview = document.createElement("p");
      preview.className = "card-preview";
      preview.textContent = record.result || "梁底計算";

      var sub = document.createElement("p");
      sub.className = "card-sub";
      sub.textContent = beamPreview(record.values || {});

      body.appendChild(meta);
      body.appendChild(preview);
      body.appendChild(sub);

      var actions = document.createElement("div");
      actions.className = "card-actions";

      var restore = document.createElement("button");
      restore.className = "button-ghost card-restore";
      restore.type = "button";
      restore.dataset.action = "restore-beam";
      restore.textContent = "復元";

      var remove = document.createElement("button");
      remove.className = "icon-button is-danger";
      remove.type = "button";
      remove.dataset.action = "delete-beam";
      remove.setAttribute("aria-label", "削除");
      remove.textContent = "×";

      actions.appendChild(restore);
      actions.appendChild(remove);
      card.appendChild(body);
      card.appendChild(actions);
      beamSaveList.appendChild(card);
    });
  }

  function restoreBeamRecord(id) {
    var record = beamSaves.find(function (item) {
      return item.id === id;
    });
    if (!record || !record.values) {
      return;
    }

    Object.keys(beamFields).forEach(function (key) {
      beamFields[key].value = normalizeNumericText(record.values[key]) || "0";
    });
    saveBeamInputs();
    renderBeam();
    showToast("復元しました");
  }

  function deleteBeamRecord(id) {
    beamSaves = beamSaves.filter(function (item) {
      return item.id !== id;
    });
    writeJson(STORAGE.beamSaves, beamSaves);
    renderBeamSaves();
    showToast("削除しました");
  }

  function formatBeamDistance(value) {
    var rounded = roundMm(value);
    if (rounded === 0) {
      return "梁底±0mm";
    }
    return "梁底" + (rounded > 0 ? "+" : "-") + Math.abs(rounded) + "mm";
  }

  function formatMm(value) {
    return roundMm(value) + "mm";
  }

  function roundMm(value) {
    return Math.round(value * 10) / 10;
  }

  function toNumber(value) {
    var normalized = normalizeNumericText(value);
    if (normalized === "" || normalized === "-") {
      return 0;
    }
    var number = Number(normalized);
    return Number.isFinite(number) ? number : 0;
  }

  function copyText(text, message) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showToast(message);
      }).catch(function () {
        fallbackCopy(text, message);
      });
      return;
    }
    fallbackCopy(text, message);
  }

  function fallbackCopy(text, message) {
    var buffer = document.createElement("textarea");
    buffer.value = text;
    buffer.setAttribute("readonly", "readonly");
    buffer.style.position = "fixed";
    buffer.style.left = "-9999px";
    document.body.appendChild(buffer);
    buffer.select();
    document.execCommand("copy");
    document.body.removeChild(buffer);
    showToast(message);
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimer = setTimeout(function () {
      toast.classList.remove("is-visible");
    }, 1800);
  }

  function normalizeBeamField(field, finalize) {
    var normalized = normalizeNumericText(field.value);
    if (finalize && (normalized === "" || normalized === "-")) {
      normalized = "0";
    }
    if (field.value !== normalized) {
      field.value = normalized;
    }
  }

  function normalizeNumericText(value) {
    var text = String(value === undefined || value === null ? "" : value);
    text = text.replace(/[０-９]/g, function (char) {
      return String.fromCharCode(char.charCodeAt(0) - 0xfee0);
    });
    text = text.replace(/[－ー―−ｰ]/g, "-");
    var trimmed = text.trim();
    var negative = trimmed.charAt(0) === "-";
    var digits = text.replace(/[^0-9]/g, "");
    return (negative ? "-" : "") + digits;
  }

  function numericValueForStorage(value) {
    var normalized = normalizeNumericText(value);
    return normalized === "" || normalized === "-" ? "0" : normalized;
  }

  function getBeamStorageValues() {
    var values = {};
    Object.keys(beamFields).forEach(function (key) {
      normalizeBeamField(beamFields[key], true);
      values[key] = numericValueForStorage(beamFields[key].value);
    });
    saveBeamInputs();
    renderBeam();
    return values;
  }

  function beamPreview(values) {
    return [
      "階高" + (values.floorHeightFl || "0"),
      "芯" + (values.sleeveCenterFl || "0"),
      "梁成" + (values.beamDepth || "0"),
      "フカシ" + (values.bottomFukashi || "0"),
      "天端" + (values.slabTopLevel || "0")
    ].join(" / ");
  }

  function getPatternOption(id) {
    return PATTERN_OPTIONS.find(function (pattern) {
      return pattern.id === id;
    });
  }

  function isFloorField(field) {
    return Object.keys(floorFields).some(function (key) {
      return floorFields[key] === field;
    });
  }

  function makePreview(text) {
    var compact = String(text || "").replace(/\s+/g, " ").trim();
    if (!compact) {
      return "文字なし";
    }
    return compact.length > 60 ? compact.slice(0, 60) + "..." : compact;
  }

  function formatDate(value) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      date = new Date();
    }
    return [
      date.getFullYear(),
      "/",
      pad(date.getMonth() + 1),
      "/",
      pad(date.getDate()),
      " ",
      pad(date.getHours()),
      ":",
      pad(date.getMinutes())
    ].join("");
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function createId() {
    if (window.crypto && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      return false;
    }
    return true;
  }
})();
