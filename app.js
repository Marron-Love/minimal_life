/**
 * Minimal Life App Logic
 * handles IndexedDB storage and UI updates
 */

document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const addBtn = document.getElementById('add-btn');
    const modal = document.getElementById('item-modal');
    const closeModalCallback = document.getElementById('close-modal');
    const form = document.getElementById('add-item-form');
    const imageInput = document.getElementById('image-input');
    const imagePreview = document.getElementById('image-preview');
    const gallery = document.getElementById('item-gallery');
    const totalCountEl = document.getElementById('total-count');
    const emptyState = document.getElementById('empty-state');
    const dateInput = document.getElementById('date-input');
    const pasteBtn = document.getElementById('paste-btn');
    const reasonInput = document.getElementById('reason-input');
    const charCount = document.getElementById('char-count');
    const exportBtn = document.getElementById('export-btn');

    // Set default date to today
    dateInput.valueAsDate = new Date();

    // DB Configuration
    const DB_NAME = 'MinimalLifeDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'discarded_items';
    let db;

    // --- Database Operations ---

    const initDB = () => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error("Database error:", event.target.error);
                reject('Error opening database');
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                loadItems();
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                // Create an object store to hold information about our items.
                // We're going to use "id" as our key path because it's guaranteed to be unique.
                const objectStore = db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
                objectStore.createIndex("date", "date", { unique: false });
            };
        });
    };

    const addItemToDB = (item) => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], "readwrite");
            const objectStore = transaction.objectStore(STORE_NAME);
            const request = objectStore.add(item);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    };

    const deleteItemFromDB = (id) => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], "readwrite");
            const objectStore = transaction.objectStore(STORE_NAME);
            const request = objectStore.delete(id);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    };

    const getAllItems = () => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], "readonly");
            const objectStore = transaction.objectStore(STORE_NAME);
            const request = objectStore.getAll();

            request.onsuccess = (event) => {
                resolve(event.target.result);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    };

    // --- UI Logic ---

    const toggleModal = (show) => {
        if (show) {
            modal.classList.remove('hidden');
        } else {
            modal.classList.add('hidden');
            resetForm();
        }
    };

    const resetForm = () => {
        form.reset();
        dateInput.valueAsDate = new Date();
        imagePreview.innerHTML = `
            <i class="fa-regular fa-image"></i>
            <span>사진 업로드</span>
        `;
        imagePreview.classList.remove('has-image');
        currentImageFile = null;
        charCount.textContent = '0/50';
        charCount.classList.remove('warning');
    };

    const renderItems = (items) => {
        gallery.innerHTML = '';
        totalCountEl.textContent = items.length;

        if (items.length === 0) {
            emptyState.classList.remove('hidden');
            exportBtn.classList.add('hidden');
            return;
        } else {
            emptyState.classList.add('hidden');
            exportBtn.classList.remove('hidden');
        }

        // Sort items by date descending (newest first)
        items.sort((a, b) => new Date(b.date) - new Date(a.date));

        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'item-card';

            // Convert Blob/File to URL
            const imageUrl = URL.createObjectURL(item.image);

            card.innerHTML = `
                <div class="card-image-container">
                    <img src="${imageUrl}" alt="Discarded Item" class="card-image" loading="lazy">
                    <button class="delete-btn" data-id="${item.id}">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
                <div class="card-content">
                    <span class="card-date">${formatDate(item.date)}</span>
                    ${item.disposalMethod ? `<p class="card-disposal"><i class="fa-solid fa-tag"></i> ${escapeHtml(item.disposalMethod)}</p>` : ''}
                    <p class="card-reason">${escapeHtml(item.reason)}</p>
                </div>
            `;
            gallery.appendChild(card);
        });

        // Add delete listeners
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation(); // Prevent card click if we add that later
                if (confirm('이 기록을 삭제하시겠습니까?')) {
                    const id = Number(btn.dataset.id);
                    await deleteItemFromDB(id);
                    loadItems();
                }
            });
        });
    };

    const loadItems = async () => {
        try {
            const items = await getAllItems();
            renderItems(items);
        } catch (error) {
            console.error("Failed to load items:", error);
        }
    };

    const formatDate = (dateString) => {
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        return new Date(dateString).toLocaleDateString('ko-KR', options);
    };

    const escapeHtml = (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    let currentImageFile = null;

    // --- Image Processing ---

    const cropImageToSquare = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    // Create canvas for cropping
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    const targetSize = 512;
                    canvas.width = targetSize;
                    canvas.height = targetSize;

                    // Calculate crop dimensions (center crop)
                    const scale = Math.max(targetSize / img.width, targetSize / img.height);
                    const scaledWidth = img.width * scale;
                    const scaledHeight = img.height * scale;

                    // Center the image
                    const offsetX = (targetSize - scaledWidth) / 2;
                    const offsetY = (targetSize - scaledHeight) / 2;

                    // Draw cropped image
                    ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);

                    // Convert canvas to blob
                    canvas.toBlob((blob) => {
                        if (blob) {
                            const croppedFile = new File([blob], file.name, {
                                type: 'image/jpeg',
                                lastModified: Date.now()
                            });
                            resolve(croppedFile);
                        } else {
                            reject(new Error('Failed to create blob'));
                        }
                    }, 'image/jpeg', 0.9);
                };
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    };

    // --- Event Listeners ---

    addBtn.addEventListener('click', () => toggleModal(true));
    closeModalCallback.addEventListener('click', () => toggleModal(false));

    // Close modal if clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) toggleModal(false);
    });

    // Image Preview Code
    imageInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                // Crop image to 512x512 square
                const croppedFile = await cropImageToSquare(file);
                currentImageFile = croppedFile;

                const reader = new FileReader();
                reader.onload = (event) => {
                    imagePreview.innerHTML = `<img src="${event.target.result}" alt="Preview">`;
                    imagePreview.classList.add('has-image');
                };
                reader.readAsDataURL(croppedFile);
            } catch (error) {
                console.error('Image processing failed:', error);
                alert('이미지 처리에 실패했습니다.');
            }
        }
    });

    // Clipboard Paste Handler
    pasteBtn.addEventListener('click', async () => {
        try {
            const clipboardItems = await navigator.clipboard.read();
            for (const clipboardItem of clipboardItems) {
                for (const type of clipboardItem.types) {
                    if (type.startsWith('image/')) {
                        const blob = await clipboardItem.getType(type);
                        const file = new File([blob], 'clipboard-image.png', { type: blob.type });

                        // Crop image to 512x512 square
                        const croppedFile = await cropImageToSquare(file);
                        currentImageFile = croppedFile;

                        const reader = new FileReader();
                        reader.onload = (event) => {
                            imagePreview.innerHTML = `<img src="${event.target.result}" alt="Preview">`;
                            imagePreview.classList.add('has-image');
                        };
                        reader.readAsDataURL(croppedFile);
                        return;
                    }
                }
            }
            alert('클립보드에 이미지가 없습니다.');
        } catch (err) {
            console.error('클립보드 접근 실패:', err);
            alert('클립보드에서 이미지를 가져올 수 없습니다.');
        }
    });

    // Character Counter
    reasonInput.addEventListener('input', () => {
        const length = reasonInput.value.length;
        charCount.textContent = `${length}/50`;
        if (length >= 45) {
            charCount.classList.add('warning');
        } else {
            charCount.classList.remove('warning');
        }
    });

    // Form Submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const date = document.getElementById('date-input').value;
        const reason = document.getElementById('reason-input').value;

        // Get checked disposal method
        const checkedMethod = document.querySelector('input[name="disposal-method"]:checked');
        const disposalMethod = checkedMethod ? checkedMethod.value : '';

        if (!currentImageFile) {
            alert("사진을 첨부해주세요.");
            return;
        }

        const newItem = {
            image: currentImageFile, // Blob stored directly in IndexedDB
            date: date,
            reason: reason,
            disposalMethod: disposalMethod,
            createdAt: new Date().toISOString()
        };

        try {
            await addItemToDB(newItem);
            toggleModal(false);
            loadItems();
        } catch (error) {
            console.error("Error saving item:", error);
            alert("저장에 실패했습니다.");
        }
    });

    // --- Collage Export Function ---

    const calculateGridDimensions = (count) => {
        // Calculate optimal grid dimensions
        if (count === 0) return { rows: 0, cols: 0 };

        const sqrt = Math.sqrt(count);
        let cols = Math.ceil(sqrt);
        let rows = Math.ceil(count / cols);

        // Adjust for better aspect ratio
        while (cols * rows > count && rows > 1) {
            if ((cols - 1) * rows >= count) {
                cols--;
            } else if (cols * (rows - 1) >= count) {
                rows--;
            } else {
                break;
            }
        }

        return { rows, cols };
    };

    const exportCollage = async () => {
        try {
            const items = await getAllItems();

            if (items.length === 0) {
                alert('익스포트할 이미지가 없습니다.');
                return;
            }

            // Sort by date ascending (oldest first) for chronological order
            items.sort((a, b) => new Date(a.date) - new Date(b.date));

            // Get date range
            const firstDate = new Date(items[0].date);
            const lastDate = new Date(items[items.length - 1].date);
            const dateRangeText = `${firstDate.getFullYear()}.${String(firstDate.getMonth() + 1).padStart(2, '0')}.${String(firstDate.getDate()).padStart(2, '0')} ~ ${lastDate.getFullYear()}.${String(lastDate.getMonth() + 1).padStart(2, '0')}.${String(lastDate.getDate()).padStart(2, '0')}`;

            // Calculate grid dimensions
            const { rows, cols } = calculateGridDimensions(items.length);

            // Image dimensions
            const imgSize = 200; // Size of each thumbnail
            const padding = 10;
            const headerHeight = 80;

            const canvasWidth = cols * (imgSize + padding) + padding;
            const canvasHeight = rows * (imgSize + padding) + padding + headerHeight;

            // Create canvas
            const canvas = document.createElement('canvas');
            canvas.width = canvasWidth;
            canvas.height = canvasHeight;
            const ctx = canvas.getContext('2d');

            // Background
            ctx.fillStyle = '#f7f9fc';
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);

            // Header with date range
            ctx.fillStyle = '#2d3436';
            ctx.font = 'bold 28px "Outfit", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Minimal Life', canvasWidth / 2, 35);

            ctx.font = '18px "Outfit", sans-serif';
            ctx.fillStyle = '#6c5ce7';
            ctx.fillText(dateRangeText, canvasWidth / 2, 60);

            // Load and draw images
            const imagePromises = items.map((item, index) => {
                return new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        const row = Math.floor(index / cols);
                        const col = index % cols;

                        const x = col * (imgSize + padding) + padding;
                        const y = row * (imgSize + padding) + padding + headerHeight;

                        // Draw white background for image
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(x, y, imgSize, imgSize);

                        // Draw image (cover fit)
                        const scale = Math.max(imgSize / img.width, imgSize / img.height);
                        const scaledWidth = img.width * scale;
                        const scaledHeight = img.height * scale;
                        const offsetX = (imgSize - scaledWidth) / 2;
                        const offsetY = (imgSize - scaledHeight) / 2;

                        ctx.drawImage(img, x + offsetX, y + offsetY, scaledWidth, scaledHeight);

                        // Border
                        ctx.strokeStyle = '#e0e0e0';
                        ctx.lineWidth = 2;
                        ctx.strokeRect(x, y, imgSize, imgSize);

                        resolve();
                    };
                    img.onerror = () => {
                        console.error('Failed to load image:', index);
                        resolve(); // Continue even if one image fails
                    };
                    img.src = URL.createObjectURL(item.image);
                });
            });

            // Wait for all images to load
            await Promise.all(imagePromises);

            // Download canvas as image
            canvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `minimal-life-${items.length}items-${Date.now()}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 'image/png');

        } catch (error) {
            console.error('Export failed:', error);
            alert('익스포트에 실패했습니다.');
        }
    };

    // Export button event listener
    exportBtn.addEventListener('click', exportCollage);

    // Initial Load
    initDB();
});
