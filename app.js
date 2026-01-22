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
            return;
        } else {
            emptyState.classList.add('hidden');
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

    // --- Event Listeners ---

    addBtn.addEventListener('click', () => toggleModal(true));
    closeModalCallback.addEventListener('click', () => toggleModal(false));

    // Close modal if clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) toggleModal(false);
    });

    // Image Preview Code
    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            currentImageFile = file;
            const reader = new FileReader();
            reader.onload = (event) => {
                imagePreview.innerHTML = `<img src="${event.target.result}" alt="Preview">`;
                imagePreview.classList.add('has-image');
            };
            reader.readAsDataURL(file);
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
                        currentImageFile = new File([blob], 'clipboard-image.png', { type: blob.type });

                        const reader = new FileReader();
                        reader.onload = (event) => {
                            imagePreview.innerHTML = `<img src="${event.target.result}" alt="Preview">`;
                            imagePreview.classList.add('has-image');
                        };
                        reader.readAsDataURL(blob);
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

    // Initial Load
    initDB();
});
