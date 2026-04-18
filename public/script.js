/**
 * script.js - Client-side logic for Student Resource Hub
 */

window.API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';
const API_BASE = window.API_BASE; // Keep local ref for backward compatibility within this file

// Add script-level logging
console.log('script.js loaded, API_BASE:', API_BASE);

// Initialize navigation on all pages
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded, path:', window.location.pathname);
    updateNavigation();

    // Close modal event listeners
    const modal = document.getElementById('preview-modal');
    const closeBtn = document.querySelector('.close-modal');
    if (closeBtn) {
        closeBtn.onclick = () => modal.style.display = 'none';
    }
    window.onclick = (event) => {
        if (event.target == modal) modal.style.display = 'none';
    }
});

/**
 * Open the preview modal with the document content.
 */
function openPreview(url, title, filename) {
    const modal = document.getElementById('preview-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');

    if (!modal || !modalBody) return;

    modalTitle.innerText = `Preview: ${title}`;
    modalBody.innerHTML = ''; // Clear previous content

    const ext = filename.split('.').pop().toLowerCase();
    
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
        // Show image
        const img = document.createElement('img');
        img.src = url;
        img.className = 'preview-image';
        modalBody.appendChild(img);
    } else if (ext === 'pdf') {
        // Show PDF
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.className = 'preview-pdf';
        modalBody.appendChild(iframe);
    } else {
        // Fallback for other files
        modalBody.innerHTML = `<div class="text-center"><p class="mb-8">Preview not available for .${ext} files.</p><a href="${url}" class="btn" target="_blank">Open in New Tab</a></div>`;
    }

    modal.style.display = 'block';
}

/**
 * Update the navigation bar based on the user's login status.
 */
function updateNavigation() {
    const nav = document.getElementById('main-nav');
    if (!nav) {
        console.warn('Navigation: #main-nav element not found on this page.');
        return;
    }

    const currentUser = localStorage.getItem('currentUser');
    console.log('Navigation: Updating for user:', currentUser);
    
    let navHtml = '<ul>';
    navHtml += '<li><a href="index.html">Home</a></li>';

    if (currentUser) {
        const displayUser = localStorage.getItem('currentNickname') || currentUser;
        navHtml += '<li><a href="dashboard.html">Dashboard</a></li>';
        navHtml += '<li><a href="upload.html">Upload</a></li>';
        navHtml += `<li><span class="user-greeting">Hi, ${displayUser}</span></li>`;
        navHtml += '<li><a href="#" id="logout-btn" class="btn btn-danger" style="padding: 6px 12px; font-size: 0.75rem;">Logout</a></li>';
    } else {
        navHtml += '<li><a href="login.html">Login</a></li>';
        navHtml += '<li><a href="register.html" class="btn" style="padding: 6px 16px; font-size: 0.75rem;">Join</a></li>';
    }
    navHtml += '</ul>';
    nav.innerHTML = navHtml;

    // Attach logout event listener
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('currentUser');
            localStorage.removeItem('currentNickname');
            window.location.href = 'index.html';
        });
    }
}

/**
 * Fetch and display notes for a specific subject.
 * @param {string} subject - The subject name
 * @param {string} search - Search query
 * @param {string} sort - Sort method ('latest' or 'likes')
 * @param {string} tag - Filter by tag
 */
async function loadNotes(subject = '', search = '', sort = 'latest', tag = '') {
    const container = document.getElementById('notes-container');
    if (!container) return;

    try {
        let url = `${API_BASE}/api/notes?subject=${encodeURIComponent(subject)}&search=${encodeURIComponent(search)}&sort=${sort}`;
        if (tag) url += `&tag=${encodeURIComponent(tag)}`;
        
        const response = await fetch(url);
        const notes = await response.json();

        container.innerHTML = '';
        if (notes.length === 0) {
            container.innerHTML = `<p class="status-message info">No notes found matching your criteria. ${tag ? `<a href="#" onclick="loadNotes('${subject}', '${search}', '${sort}', '')">Clear tag filter</a>` : ''}</p>`;
            return;
        }

        notes.forEach(note => {
            container.appendChild(createNoteCard(note));
        });
    } catch (error) {
        console.error('Error loading notes:', error);
    }
}

/**
 * Helper to create a note card element.
 */
function createNoteCard(note) {
    const card = document.createElement('div');
    card.className = 'note-card';

    const noteId = note._id || note.id; // Handle both MongoDB and Local IDs
    const date = new Date(note.uploadDate).toLocaleDateString();
    const currentUser = localStorage.getItem('currentUser');
    const isOwner = currentUser && note.username === currentUser;
    const hasLiked = note.likedBy && note.likedBy.includes(currentUser);
    const hasDisliked = note.dislikedBy && note.dislikedBy.includes(currentUser);

    const params = new URLSearchParams(window.location.search);
    const subject = params.get('subject') || '';

    let htmlContent = `
        <div class="note-card-header">
            <h4>${note.title}</h4>
            <span class="subject-tag">${note.subject}</span>
        </div>
        <div class="note-card-info">
            <p><strong>File:</strong> ${note.originalName}</p>
            <p><strong>By:</strong> ${note.nickname || note.username}</p>
            <p><strong>Date:</strong> ${date}</p>
        </div>
        
        <div class="note-stats">
            <span class="likes-count">👍 ${note.likes || 0} Likes</span>
            <span class="dislikes-count">👎 ${note.dislikes || 0} Dislikes</span>
            <span class="downloads-count">📥 ${note.downloads || 0} Downloads</span>
            <span class="comments-count">💬 ${note.comments ? note.comments.length : 0} Comments</span>
        </div>

        ${note.tags && note.tags.length > 0 ? `
            <div class="note-tags">
                ${note.tags.map(tag => `<span class="tag clickable-tag" onclick="loadNotes('${subject}', '', 'latest', '${tag}')">#${tag}</span>`).join('')}
            </div>
        ` : ''}

        <div class="card-actions">
    `;

    if (currentUser) {
        const downloadUrl = note.downloadUrl || '#';
        htmlContent += `
            <button class="btn btn-sm" onclick="openPreview('${downloadUrl}', '${note.title}', '${note.filename}')">Preview</button>
            <a href="${downloadUrl}" class="btn btn-sm btn-outline download-btn" download onclick="trackDownload('${noteId}', this)" style="text-decoration: none;">📥 Download</a>
            <button class="btn btn-sm ${hasLiked ? 'btn-disabled' : 'btn-outline'}" 
                    onclick="likeNote('${noteId}', this)" ${hasLiked ? 'disabled' : ''}>
                ${hasLiked ? 'Liked' : '👍 Like'}
            </button>
            <button class="btn btn-sm ${hasDisliked ? 'btn-disabled' : 'btn-outline'}" 
                    onclick="dislikeNote('${noteId}', this)" ${hasDisliked ? 'disabled' : ''}>
                ${hasDisliked ? 'Disliked' : '👎 Dislike'}
            </button>
        `;
    } else {
        htmlContent += `<a href="login.html" class="btn btn-sm btn-muted">Login to Access</a>`;
    }

    if (isOwner) {
        htmlContent += `<button class="btn btn-sm btn-danger" onclick="deleteNote('${noteId}', this)">Delete</button>`;
    }

    htmlContent += `</div>
        <div class="comment-section">
            <div class="comments-list" id="comments-${noteId}">
                ${(note.comments || []).map(c => `
                    <div class="comment-item">
                        <strong>${c.username}:</strong> ${c.text}
                    </div>
                `).join('')}
            </div>
            ${currentUser ? `
                <div class="comment-input-group">
                    <input type="text" placeholder="Add a comment..." id="input-${noteId}">
                    <button onclick="addComment('${noteId}')">Post</button>
                </div>
            ` : ''}
        </div>
    `;
    
    card.innerHTML = htmlContent;
    return card;
}

async function likeNote(noteId, button) {
    const username = localStorage.getItem('currentUser');
    if (!username) return;

    try {
        const response = await fetch(`${API_BASE}/api/notes/${noteId}/like`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        const data = await response.json();
        if (response.ok) {
            button.innerText = 'Liked';
            button.disabled = true;
            button.classList.add('btn-disabled');
            
            const card = button.closest('.note-card');
            const likesStats = card.querySelector('.likes-count');
            const dislikesStats = card.querySelector('.dislikes-count');
            
            likesStats.innerText = `👍 ${data.likes} Likes`;
            dislikesStats.innerText = `👎 ${data.dislikes} Dislikes`;

            // Reset dislike button if it was disabled
            const dislikeBtn = card.querySelector('button[onclick^="dislikeNote"]');
            if (dislikeBtn) {
                dislikeBtn.innerText = '👎 Dislike';
                dislikeBtn.disabled = false;
                dislikeBtn.classList.remove('btn-disabled');
                dislikeBtn.classList.add('btn-outline');
            }
        } else {
            alert(data.error || 'Failed to like note');
        }
    } catch (error) {
        console.error('Like error:', error);
        alert('Error: Could not connect to server.');
    }
}

async function dislikeNote(noteId, button) {
    const username = localStorage.getItem('currentUser');
    if (!username) return;

    try {
        const response = await fetch(`${API_BASE}/api/notes/${noteId}/dislike`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        const data = await response.json();
        if (response.ok) {
            button.innerText = 'Disliked';
            button.disabled = true;
            button.classList.add('btn-disabled');
            
            const card = button.closest('.note-card');
            const likesStats = card.querySelector('.likes-count');
            const dislikesStats = card.querySelector('.dislikes-count');
            
            likesStats.innerText = `👍 ${data.likes} Likes`;
            dislikesStats.innerText = `👎 ${data.dislikes} Dislikes`;

            // Reset like button if it was disabled
            const likeBtn = card.querySelector('button[onclick^="likeNote"]');
            if (likeBtn) {
                likeBtn.innerText = '👍 Like';
                likeBtn.disabled = false;
                likeBtn.classList.remove('btn-disabled');
                likeBtn.classList.add('btn-outline');
            }
        } else {
            alert(data.error || 'Failed to dislike note');
        }
    } catch (error) {
        console.error('Dislike error:', error);
        alert('Error: Could not connect to server.');
    }
}

async function addComment(noteId) {
    const username = localStorage.getItem('currentUser');
    const input = document.getElementById(`input-${noteId}`);
    const text = input.value.trim();
    if (!username || !text) return;

    try {
        const response = await fetch(`${API_BASE}/api/notes/${noteId}/comment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, text })
        });
        const comment = await response.json();
        if (response.ok) {
            const list = document.getElementById(`comments-${noteId}`);
            const div = document.createElement('div');
            div.className = 'comment-item';
            div.innerHTML = `<strong>${comment.username}:</strong> ${comment.text}`;
            list.appendChild(div);
            input.value = '';
        } else {
            alert(comment.error || 'Failed to add comment');
        }
    } catch (error) {
        console.error('Comment error:', error);
        alert('Error: Could not connect to server.');
    }
}

function formatMarkdown(text) {
    if (!text) return '';
    // Basic bullet point formatting
    return text.split('\n').map(line => {
        line = line.trim();
        if (line.startsWith('*') || line.startsWith('-')) {
            return `<li>${line.substring(1).trim()}</li>`;
        }
        return line ? `<p>${line}</p>` : '';
    }).join('');
}

/**
 * Delete a note from the server and local storage.
 * @param {number} noteId - The ID of the note to delete
 * @param {HTMLElement} button - The button element that was clicked
 */
async function deleteNote(noteId, button) {
    if (!confirm('Are you sure you want to delete this note?')) return;

    const currentUser = localStorage.getItem('currentUser');

    try {
        const response = await fetch(`${API_BASE}/api/notes/${noteId}?username=${encodeURIComponent(currentUser)}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            // Remove the card from the UI
            const card = button.closest('.note-card');
            card.remove();

            // Check if there are any notes left in the container
            const container = document.getElementById('notes-container');
            if (container && container.children.length === 0) {
                container.innerHTML = '<p class="status-message info">No notes available for this subject yet. Be the first to upload one!</p>';
            }
        } else {
            const result = await response.json();
            alert(`Error: ${result.error || 'Failed to delete note'}`);
        }
    } catch (error) {
        console.error('Error during deletion:', error);
        alert('Error: Something went wrong.');
    }
}

/**
 * Track a completely new download counter hit via the API
 * @param {string} noteId 
 * @param {HTMLElement} button 
 */
async function trackDownload(noteId, button) {
    try {
        await fetch(`${API_BASE}/api/notes/${noteId}/track-download`, {
            method: 'POST'
        });
        
        // Optimistic UI update for Dashboard and Browse pages
        if (button) {
            const card = button.closest('.note-card') || button.closest('.note-item-dash');
            if (card) {
                const downloadSpan = card.querySelector('.downloads-count');
                if (downloadSpan) {
                    const current = parseInt(downloadSpan.innerText.replace(/[^0-9]/g, '')) || 0;
                    downloadSpan.innerText = `📥 ${current + 1} Downloads`;
                }
            }
        }
    } catch (err) {
        console.error('Failed to track download:', err);
    }
}
