class ImageAnnotator {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.image = null;
    this.currentTool = "arrow";
    this.isDrawing = false;
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    this.annotations = [];
    this.selectedAnnotation = null;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.lineWidth = 3;
    this.fontSize = 48;
    this.isEditingText = false;
    this.editingAnnotation = null;

    this.history = [];
    this.historyIndex = -1;
    this.maxHistorySize = 50;

    this.init();
    this.registerServiceWorker();
    this.setupInstallPrompt();
  }

  init() {
    this.setupEventListeners();
    this.saveState();
  }

  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('service-worker.js');
        console.log('ServiceWorker registration successful:', registration);
      } catch (error) {
        console.log('ServiceWorker registration failed:', error);
      }
    }
  }

  setupInstallPrompt() {
    let deferredPrompt;
    const installBtn = document.getElementById('install-btn');

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      installBtn.classList.remove('hidden');
    });

    installBtn.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        deferredPrompt = null;
        installBtn.classList.add('hidden');
      }
    });

    window.addEventListener('appinstalled', () => {
      installBtn.classList.add('hidden');
      console.log('PWA was installed');
    });
  }

  setupEventListeners() {
    const uploadArea = document.getElementById("upload-area");
    const fileInput = document.getElementById("file-input");
    const toolButtons = document.querySelectorAll(".tool-btn");
    const clearBtn = document.getElementById("clear-btn");
    const saveBtn = document.getElementById("save-btn");
    const undoBtn = document.getElementById("undo-btn");
    const redoBtn = document.getElementById("redo-btn");
    const textEditor = document.getElementById("text-editor");

    const lineWidthSlider = document.getElementById("line-width");
    const fontSizeSlider = document.getElementById("font-size");
    const widthValue = document.getElementById("width-value");
    const fontSizeValue = document.getElementById("font-size-value");

    uploadArea.addEventListener("click", () => fileInput.click());
    uploadArea.addEventListener("dragover", this.handleDragOver.bind(this));
    uploadArea.addEventListener("drop", this.handleDrop.bind(this));
    uploadArea.addEventListener("dragenter", this.handleDragEnter.bind(this));
    uploadArea.addEventListener("dragleave", this.handleDragLeave.bind(this));

    fileInput.addEventListener("change", this.handleFileSelect.bind(this));

    toolButtons.forEach((btn) => {
      btn.addEventListener("click", this.selectTool.bind(this));
    });

    clearBtn.addEventListener("click", this.clearAnnotations.bind(this));
    saveBtn.addEventListener("click", this.saveImage.bind(this));
    undoBtn.addEventListener("click", this.undo.bind(this));
    redoBtn.addEventListener("click", this.redo.bind(this));

    document.addEventListener("keydown", this.handleKeyDown.bind(this));

    textEditor.addEventListener(
      "keydown",
      this.handleTextEditorKeyDown.bind(this),
    );
    textEditor.addEventListener("blur", this.finishTextEditing.bind(this));
    textEditor.addEventListener("input", this.updateTextEditorSize.bind(this));

    lineWidthSlider.addEventListener("input", (e) => {
      this.lineWidth = parseInt(e.target.value);
      widthValue.textContent = this.lineWidth;

      // Update selected annotation if it exists and is not text
      if (this.selectedAnnotation && this.selectedAnnotation.type !== "text") {
        this.selectedAnnotation.lineWidth = this.lineWidth;
        this.redrawCanvas();
        this.saveState();
      }
    });

    fontSizeSlider.addEventListener("input", (e) => {
      this.fontSize = parseInt(e.target.value);
      fontSizeValue.textContent = this.fontSize;

      // Update selected annotation if it exists and is text
      if (this.selectedAnnotation && this.selectedAnnotation.type === "text") {
        this.selectedAnnotation.fontSize = this.fontSize;
        this.redrawCanvas();
        this.saveState();
      }

      // Update text editor font size if editing
      if (this.isEditingText) {
        textEditor.style.fontSize = this.fontSize + "px";
        this.updateTextEditorSize();
      }
    });
  }

  handleTextEditorKeyDown(e) {
    if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      this.finishTextEditing();
    }
    e.stopPropagation(); // Prevent global keyboard shortcuts while editing
  }

  startTextEditing(annotation, x, y) {
    console.log("Starting text editing at canvas coords:", x, y); // Debug log
    this.isEditingText = true;
    this.editingAnnotation = annotation;

    const textEditor = document.getElementById("text-editor");
    const canvasContainer = document.getElementById("canvas-container");
    const canvasRect = this.canvas.getBoundingClientRect();

    // Calculate the scale between canvas internal coordinates and displayed canvas
    const scaleX = canvasRect.width / this.canvas.width;
    const scaleY = canvasRect.height / this.canvas.height;

    // Convert canvas coordinates to screen position relative to canvas
    const editorX = x * scaleX;
    const editorY =
      (y - (annotation ? annotation.fontSize : this.fontSize)) * scaleY;

    console.log("Canvas rect:", canvasRect); // Debug log
    console.log("Scale factors:", scaleX, scaleY); // Debug log
    console.log("Editor position relative to canvas:", editorX, editorY); // Debug log

    textEditor.value = annotation ? annotation.text : "";
    textEditor.style.fontSize =
      (annotation ? annotation.fontSize : this.fontSize) * scaleY + "px";
    textEditor.style.left = editorX + "px";
    textEditor.style.top = editorY + "px";

    // Force show the editor
    textEditor.classList.remove("hidden");
    textEditor.style.display = "block";

    console.log("Text editor classes:", textEditor.className); // Debug log
    console.log("Text editor display:", textEditor.style.display); // Debug log

    this.updateTextEditorSize();

    // Use setTimeout to ensure DOM updates
    setTimeout(() => {
      textEditor.focus();
      textEditor.select();
    }, 10);
  }

  updateTextEditorSize() {
    const textEditor = document.getElementById("text-editor");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.font = textEditor.style.fontSize + " Arial";

    const textWidth = ctx.measureText(textEditor.value || "W").width;
    textEditor.style.width = Math.max(100, textWidth + 20) + "px";
  }

  finishTextEditing() {
    if (!this.isEditingText) return;

    const textEditor = document.getElementById("text-editor");
    const text = textEditor.value.trim();

    if (this.editingAnnotation) {
      // Editing existing annotation
      if (text) {
        this.editingAnnotation.text = text;
        this.redrawCanvas();
        this.saveState();
      } else {
        // Delete annotation if text is empty
        const index = this.annotations.indexOf(this.editingAnnotation);
        if (index > -1) {
          this.annotations.splice(index, 1);
          this.selectedAnnotation = null;
          this.redrawCanvas();
          this.saveState();
        }
      }
    } else if (text) {
      // Creating new annotation - calculate position from editor position
      const canvasRect = this.canvas.getBoundingClientRect();

      // Calculate scale between displayed canvas and internal canvas coordinates
      const scaleX = this.canvas.width / canvasRect.width;
      const scaleY = this.canvas.height / canvasRect.height;

      // Convert editor position back to canvas coordinates
      const x = parseFloat(textEditor.style.left) * scaleX;
      const y =
        (parseFloat(textEditor.style.top) +
          this.fontSize * (canvasRect.height / this.canvas.height)) *
        scaleY;

      console.log("Final text position:", x, y); // Debug log
      console.log(
        "Editor position:",
        textEditor.style.left,
        textEditor.style.top,
      ); // Debug log
      console.log("Scale factors:", scaleX, scaleY); // Debug log

      const annotation = {
        type: "text",
        x: x,
        y: y,
        text: text,
        fontSize: this.fontSize,
      };

      this.annotations.push(annotation);
      this.redrawCanvas();
      this.saveState();
    }

    // Hide the editor
    textEditor.classList.add("hidden");
    textEditor.style.display = "none";
    this.isEditingText = false;
    this.editingAnnotation = null;
  }

  handleKeyDown(e) {
    // Don't handle any shortcuts while editing text or if focused on input elements
    if (
      this.isEditingText ||
      document.activeElement.tagName === "INPUT" ||
      document.activeElement.tagName === "TEXTAREA" ||
      document.activeElement.id === "text-editor"
    ) {
      return;
    }

    if ((e.metaKey || e.ctrlKey) && e.key === "z") {
      e.preventDefault();
      if (e.shiftKey) {
        this.redo();
      } else {
        this.undo();
      }
    } else if (
      (e.key === "Backspace" || e.key === "Delete") &&
      this.selectedAnnotation
    ) {
      e.preventDefault();
      this.deleteSelectedAnnotation();
    } else if (
      e.key.toLowerCase() === "a" &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey
    ) {
      e.preventDefault();
      this.selectToolByType("arrow");
    } else if (
      e.key.toLowerCase() === "b" &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey
    ) {
      e.preventDefault();
      this.selectToolByType("box");
    } else if (
      e.key.toLowerCase() === "t" &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey
    ) {
      e.preventDefault();
      this.selectToolByType("text");
    }
  }

  selectToolByType(toolType) {
    // Don't switch tools if user is editing text or typing in an input field
    if (
      this.isEditingText ||
      document.activeElement.tagName === "INPUT" ||
      document.activeElement.tagName === "TEXTAREA" ||
      document.activeElement.id === "text-editor"
    ) {
      return;
    }

    const toolButton = document.getElementById(`${toolType}-tool`);
    if (toolButton) {
      document
        .querySelectorAll(".tool-btn")
        .forEach((btn) => btn.classList.remove("active"));
      toolButton.classList.add("active");

      this.currentTool = toolType;
      this.selectedAnnotation = null;
      this.redrawCanvas();

      this.canvas.style.cursor =
        this.currentTool === "text" ? "text" : "crosshair";
    }
  }

  deleteSelectedAnnotation() {
    if (this.selectedAnnotation) {
      const index = this.annotations.indexOf(this.selectedAnnotation);
      if (index > -1) {
        this.annotations.splice(index, 1);
        this.selectedAnnotation = null;
        this.redrawCanvas();
        this.saveState();
      }
    }
  }

  updateToolbarForSelection() {
    if (this.selectedAnnotation) {
      const lineWidthSlider = document.getElementById("line-width");
      const fontSizeSlider = document.getElementById("font-size");
      const widthValue = document.getElementById("width-value");
      const fontSizeValue = document.getElementById("font-size-value");

      if (this.selectedAnnotation.type === "text") {
        // Update font size slider to match selected text
        fontSizeSlider.value = this.selectedAnnotation.fontSize || 48;
        fontSizeValue.textContent = this.selectedAnnotation.fontSize || 48;
        this.fontSize = this.selectedAnnotation.fontSize || 48;
      } else {
        // Update width slider to match selected arrow/box
        lineWidthSlider.value = this.selectedAnnotation.lineWidth || 3;
        widthValue.textContent = this.selectedAnnotation.lineWidth || 3;
        this.lineWidth = this.selectedAnnotation.lineWidth || 3;
      }
    }
  }

  saveState() {
    const state = {
      annotations: JSON.parse(JSON.stringify(this.annotations)),
      selectedAnnotation: this.selectedAnnotation
        ? this.annotations.indexOf(this.selectedAnnotation)
        : null,
    };

    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(state);

    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }

    this.updateHistoryButtons();
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.restoreState();
    }
  }

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
      this.restoreState();
    }
  }

  restoreState() {
    const state = this.history[this.historyIndex];
    this.annotations = JSON.parse(JSON.stringify(state.annotations));

    if (
      state.selectedAnnotation !== null &&
      state.selectedAnnotation < this.annotations.length
    ) {
      this.selectedAnnotation = this.annotations[state.selectedAnnotation];
      this.updateToolbarForSelection();
    } else {
      this.selectedAnnotation = null;
    }

    this.redrawCanvas();
    this.updateHistoryButtons();
  }

  updateHistoryButtons() {
    const undoBtn = document.getElementById("undo-btn");
    const redoBtn = document.getElementById("redo-btn");

    undoBtn.disabled = this.historyIndex <= 0;
    redoBtn.disabled = this.historyIndex >= this.history.length - 1;
  }

  handleDragOver(e) {
    e.preventDefault();
  }

  handleDragEnter(e) {
    e.preventDefault();
    document.getElementById("upload-area").classList.add("dragover");
  }

  handleDragLeave(e) {
    e.preventDefault();
    document.getElementById("upload-area").classList.remove("dragover");
  }

  handleDrop(e) {
    e.preventDefault();
    document.getElementById("upload-area").classList.remove("dragover");

    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith("image/")) {
      this.loadImage(files[0]);
    }
  }

  handleFileSelect(e) {
    const file = e.target.files[0];
    if (file && file.type.startsWith("image/")) {
      this.loadImage(file);
    }
  }

  loadImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        this.image = img;
        this.annotations = [];
        this.selectedAnnotation = null;
        this.history = [];
        this.historyIndex = -1;
        this.setupCanvas();
        this.showCanvas();
        this.saveState();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  setupCanvas() {
    const uploadedImage = document.getElementById("uploaded-image");
    const canvas = document.getElementById("annotation-canvas");

    uploadedImage.src = this.image.src;

    uploadedImage.onload = () => {
      canvas.width = uploadedImage.naturalWidth;
      canvas.height = uploadedImage.naturalHeight;
      canvas.style.width = uploadedImage.offsetWidth + "px";
      canvas.style.height = uploadedImage.offsetHeight + "px";

      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");

      this.setupCanvasEvents();
    };
  }

  setupCanvasEvents() {
    this.canvas.addEventListener("mousedown", this.handleMouseDown.bind(this));
    this.canvas.addEventListener("mousemove", this.handleMouseMove.bind(this));
    this.canvas.addEventListener("mouseup", this.handleMouseUp.bind(this));
    this.canvas.addEventListener("dblclick", this.handleDoubleClick.bind(this));
  }

  updateCanvasCursor(e) {
    if (this.isDragging || this.isDrawing || this.isEditingText) return;

    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const hoveredAnnotation = this.getAnnotationAtPoint(x, y);

    if (hoveredAnnotation) {
      if (this.selectedAnnotation === hoveredAnnotation) {
        this.canvas.style.cursor = "move";
      } else {
        this.canvas.style.cursor = "pointer";
      }
    } else {
      this.canvas.style.cursor =
        this.currentTool === "text" ? "text" : "crosshair";
    }
  }

  showCanvas() {
    document.getElementById("upload-area").style.display = "none";
    document.getElementById("canvas-container").classList.remove("hidden");
  }

  selectTool(e) {
    document
      .querySelectorAll(".tool-btn")
      .forEach((btn) => btn.classList.remove("active"));
    e.target.classList.add("active");

    const toolId = e.target.id;
    this.currentTool = toolId.replace("-tool", "");

    this.selectedAnnotation = null;
    this.redrawCanvas();

    this.canvas.style.cursor =
      this.currentTool === "text" ? "text" : "crosshair";
  }

  handleMouseDown(e) {
    if (this.isEditingText) {
      this.finishTextEditing();
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const clickedAnnotation = this.getAnnotationAtPoint(x, y);

    if (clickedAnnotation) {
      this.selectedAnnotation = clickedAnnotation;
      this.isDragging = true;

      // Allow dragging from anywhere within the annotation bounds
      if (clickedAnnotation.type === "text") {
        this.dragOffsetX = x - clickedAnnotation.x;
        this.dragOffsetY = y - clickedAnnotation.y;
      } else {
        // For arrows and boxes, calculate offset from current center
        this.dragOffsetX = x - this.getAnnotationCenterX(clickedAnnotation);
        this.dragOffsetY = y - this.getAnnotationCenterY(clickedAnnotation);
      }

      this.updateToolbarForSelection();
      this.redrawCanvas();
    } else {
      // Clicking on empty area
      if (this.selectedAnnotation) {
        // If something was selected, just deselect it (don't start drawing)
        this.selectedAnnotation = null;
        this.redrawCanvas();
      } else if (this.currentTool === "text") {
        // Start text editing for new text
        this.startTextEditing(null, x, y);
      } else {
        // Only start drawing if nothing was previously selected
        this.isDrawing = true;
        this.startX = x;
        this.startY = y;
      }
    }
  }

  handleDoubleClick(e) {
    if (this.isEditingText) return;

    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const clickedAnnotation = this.getAnnotationAtPoint(x, y);

    if (clickedAnnotation && clickedAnnotation.type === "text") {
      this.startTextEditing(
        clickedAnnotation,
        clickedAnnotation.x,
        clickedAnnotation.y,
      );
    }
  }

  handleMouseMove(e) {
    // Update cursor based on what we're hovering over
    this.updateCanvasCursor(e);

    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    const currentX = (e.clientX - rect.left) * scaleX;
    const currentY = (e.clientY - rect.top) * scaleY;

    if (this.isDragging && this.selectedAnnotation) {
      if (this.selectedAnnotation.type === "text") {
        // For text, move to the exact position minus the drag offset
        this.selectedAnnotation.x = currentX - this.dragOffsetX;
        this.selectedAnnotation.y = currentY - this.dragOffsetY;
      } else {
        // For arrows and boxes, move the center to the new position
        this.moveAnnotation(
          this.selectedAnnotation,
          currentX - this.dragOffsetX,
          currentY - this.dragOffsetY,
        );
      }
      this.redrawCanvas();
    } else if (this.isDrawing && this.currentTool !== "text") {
      this.redrawCanvas();

      this.ctx.strokeStyle = "#e74c3c";
      this.ctx.lineWidth = this.lineWidth;
      this.ctx.setLineDash([]);

      if (this.currentTool === "arrow") {
        this.drawArrow(this.startX, this.startY, currentX, currentY);
      } else if (this.currentTool === "box") {
        this.drawBox(this.startX, this.startY, currentX, currentY);
      }
    }
  }

  handleMouseUp(e) {
    if (this.isDragging) {
      this.isDragging = false;
      this.saveState();
      return;
    }

    if (!this.isDrawing || this.currentTool === "text") return;

    this.isDrawing = false;

    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    const endX = (e.clientX - rect.left) * scaleX;
    const endY = (e.clientY - rect.top) * scaleY;

    if (Math.abs(endX - this.startX) < 5 && Math.abs(endY - this.startY) < 5) {
      return;
    }

    const annotation = {
      type: this.currentTool,
      startX: this.startX,
      startY: this.startY,
      endX: endX,
      endY: endY,
      lineWidth: this.lineWidth,
      fontSize: this.fontSize,
    };

    this.annotations.push(annotation);
    this.saveState();
  }

  getAnnotationAtPoint(x, y) {
    const tolerance = 10;

    for (let i = this.annotations.length - 1; i >= 0; i--) {
      const annotation = this.annotations[i];

      if (annotation.type === "text") {
        this.ctx.font = `${annotation.fontSize || 48}px Arial`;
        const textWidth = this.ctx.measureText(annotation.text).width;
        const textHeight = annotation.fontSize || 48;

        if (
          x >= annotation.x - tolerance &&
          x <= annotation.x + textWidth + tolerance &&
          y >= annotation.y - textHeight - tolerance &&
          y <= annotation.y + tolerance
        ) {
          return annotation;
        }
      } else if (annotation.type === "arrow") {
        if (
          this.isPointOnLine(
            x,
            y,
            annotation.startX,
            annotation.startY,
            annotation.endX,
            annotation.endY,
            tolerance,
          )
        ) {
          return annotation;
        }
      } else if (annotation.type === "box") {
        const minX = Math.min(annotation.startX, annotation.endX);
        const maxX = Math.max(annotation.startX, annotation.endX);
        const minY = Math.min(annotation.startY, annotation.endY);
        const maxY = Math.max(annotation.startY, annotation.endY);

        // Check if point is within the box area (not just the border)
        if (
          x >= minX - tolerance &&
          x <= maxX + tolerance &&
          y >= minY - tolerance &&
          y <= maxY + tolerance
        ) {
          return annotation;
        }
      }
    }
    return null;
  }

  getAnnotationBounds(annotation) {
    if (annotation.type === "text") {
      this.ctx.font = `${annotation.fontSize || 48}px Arial`;
      const textWidth = this.ctx.measureText(annotation.text).width;
      const textHeight = annotation.fontSize || 48;
      return {
        x: annotation.x - 5,
        y: annotation.y - textHeight - 5,
        width: textWidth + 10,
        height: textHeight + 10,
      };
    } else {
      const minX = Math.min(annotation.startX, annotation.endX);
      const maxX = Math.max(annotation.startX, annotation.endX);
      const minY = Math.min(annotation.startY, annotation.endY);
      const maxY = Math.max(annotation.startY, annotation.endY);

      return {
        x: minX - 10,
        y: minY - 10,
        width: maxX - minX + 20,
        height: maxY - minY + 20,
      };
    }
  }

  isPointInAnnotationBounds(x, y, annotation) {
    const bounds = this.getAnnotationBounds(annotation);
    return (
      x >= bounds.x &&
      x <= bounds.x + bounds.width &&
      y >= bounds.y &&
      y <= bounds.y + bounds.height
    );
  }

  isPointOnLine(px, py, x1, y1, x2, y2, tolerance) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) {
      param = dot / lenSq;
    }

    let xx, yy;
    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy) <= tolerance;
  }

  getAnnotationCenterX(annotation) {
    if (annotation.type === "text") {
      return annotation.x;
    } else {
      return (annotation.startX + annotation.endX) / 2;
    }
  }

  getAnnotationCenterY(annotation) {
    if (annotation.type === "text") {
      return annotation.y;
    } else {
      return (annotation.startY + annotation.endY) / 2;
    }
  }

  moveAnnotation(annotation, newCenterX, newCenterY) {
    if (annotation.type === "text") {
      annotation.x = newCenterX;
      annotation.y = newCenterY;
    } else {
      const currentCenterX = (annotation.startX + annotation.endX) / 2;
      const currentCenterY = (annotation.startY + annotation.endY) / 2;
      const deltaX = newCenterX - currentCenterX;
      const deltaY = newCenterY - currentCenterY;

      annotation.startX += deltaX;
      annotation.startY += deltaY;
      annotation.endX += deltaX;
      annotation.endY += deltaY;
    }
  }

  drawArrow(startX, startY, endX, endY, lineWidth = null) {
    const width = lineWidth || this.lineWidth;
    const headLength = Math.max(10, width * 3);
    const angle = Math.atan2(endY - startY, endX - startX);

    this.ctx.lineWidth = width;
    this.ctx.beginPath();
    this.ctx.moveTo(startX, startY);
    this.ctx.lineTo(endX, endY);
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(endX, endY);
    this.ctx.lineTo(
      endX - headLength * Math.cos(angle - Math.PI / 6),
      endY - headLength * Math.sin(angle - Math.PI / 6),
    );
    this.ctx.moveTo(endX, endY);
    this.ctx.lineTo(
      endX - headLength * Math.cos(angle + Math.PI / 6),
      endY - headLength * Math.sin(angle + Math.PI / 6),
    );
    this.ctx.stroke();
  }

  drawBox(startX, startY, endX, endY, lineWidth = null) {
    const width = endX - startX;
    const height = endY - startY;

    this.ctx.lineWidth = lineWidth || this.lineWidth;
    this.ctx.beginPath();
    this.ctx.rect(startX, startY, width, height);
    this.ctx.stroke();
  }

  drawText(x, y, text, fontSize = null) {
    const size = fontSize || this.fontSize;
    this.ctx.font = `${size}px Arial`;

    // Draw drop shadow
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    this.ctx.fillText(text, x + 2, y + 2);

    // Draw white stroke border
    this.ctx.strokeStyle = "white";
    this.ctx.lineWidth = 9;
    this.ctx.strokeText(text, x, y);

    // Draw main text
    this.ctx.fillStyle = "#e74c3c";
    this.ctx.fillText(text, x, y);
  }

  redrawCanvas() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.annotations.forEach((annotation) => {
      const isSelected = annotation === this.selectedAnnotation;

      this.ctx.strokeStyle = isSelected ? "#3498db" : "#e74c3c";
      this.ctx.fillStyle = isSelected ? "#3498db" : "#e74c3c";
      this.ctx.setLineDash([]);

      if (annotation.type === "arrow") {
        this.drawArrow(
          annotation.startX,
          annotation.startY,
          annotation.endX,
          annotation.endY,
          annotation.lineWidth,
        );
      } else if (annotation.type === "box") {
        this.drawBox(
          annotation.startX,
          annotation.startY,
          annotation.endX,
          annotation.endY,
          annotation.lineWidth,
        );
      } else if (annotation.type === "text") {
        this.drawText(
          annotation.x,
          annotation.y,
          annotation.text,
          annotation.fontSize,
        );
      }

      if (isSelected) {
        this.drawSelectionIndicator(annotation);
      }
    });
  }

  drawSelectionIndicator(annotation) {
    this.ctx.strokeStyle = "#3498db";
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([5, 5]);

    const bounds = this.getAnnotationBounds(annotation);

    this.ctx.beginPath();
    this.ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
    this.ctx.stroke();

    const handleSize = 8;
    const handles = [
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
      { x: bounds.x, y: bounds.y + bounds.height },
    ];

    this.ctx.fillStyle = "#3498db";
    this.ctx.setLineDash([]);
    handles.forEach((handle) => {
      this.ctx.beginPath();
      this.ctx.rect(
        handle.x - handleSize / 2,
        handle.y - handleSize / 2,
        handleSize,
        handleSize,
      );
      this.ctx.fill();
    });
  }

  clearAnnotations() {
    this.annotations = [];
    this.selectedAnnotation = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.saveState();
  }

  saveImage() {
    if (!this.canvas || !this.image) return;

    const tempCanvas = document.createElement("canvas");
    const tempCtx = tempCanvas.getContext("2d");

    tempCanvas.width = this.image.naturalWidth;
    tempCanvas.height = this.image.naturalHeight;

    tempCtx.drawImage(this.image, 0, 0);

    this.annotations.forEach((annotation) => {
      tempCtx.strokeStyle = "#e74c3c";
      tempCtx.fillStyle = "#e74c3c";
      tempCtx.setLineDash([]);

      if (annotation.type === "arrow") {
        this.drawArrowOnCanvas(
          tempCtx,
          annotation.startX,
          annotation.startY,
          annotation.endX,
          annotation.endY,
          annotation.lineWidth,
        );
      } else if (annotation.type === "box") {
        this.drawBoxOnCanvas(
          tempCtx,
          annotation.startX,
          annotation.startY,
          annotation.endX,
          annotation.endY,
          annotation.lineWidth,
        );
      } else if (annotation.type === "text") {
        this.drawTextOnCanvas(
          tempCtx,
          annotation.x,
          annotation.y,
          annotation.text,
          annotation.fontSize,
        );
      }
    });

    const link = document.createElement("a");
    link.download = "annotated-image.png";
    link.href = tempCanvas.toDataURL();
    link.click();
  }

  drawArrowOnCanvas(ctx, startX, startY, endX, endY, lineWidth = 3) {
    const headLength = Math.max(10, lineWidth * 3);
    const angle = Math.atan2(endY - startY, endX - startX);

    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(
      endX - headLength * Math.cos(angle - Math.PI / 6),
      endY - headLength * Math.sin(angle - Math.PI / 6),
    );
    ctx.moveTo(endX, endY);
    ctx.lineTo(
      endX - headLength * Math.cos(angle + Math.PI / 6),
      endY - headLength * Math.sin(angle + Math.PI / 6),
    );
    ctx.stroke();
  }

  drawBoxOnCanvas(ctx, startX, startY, endX, endY, lineWidth = 3) {
    const width = endX - startX;
    const height = endY - startY;

    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.rect(startX, startY, width, height);
    ctx.stroke();
  }

  drawTextOnCanvas(ctx, x, y, text, fontSize = 48) {
    ctx.font = `${fontSize}px Arial`;

    // Draw drop shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillText(text, x + 2, y + 2);

    // Draw white stroke border
    ctx.strokeStyle = "white";
    ctx.lineWidth = 12;
    ctx.strokeText(text, x, y);

    // Draw main text
    ctx.fillStyle = "#e74c3c";
    ctx.fillText(text, x, y);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new ImageAnnotator();
});

