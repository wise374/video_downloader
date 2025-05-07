document.addEventListener('DOMContentLoaded', () => {
    const videoUrlInput = document.getElementById('videoUrl');
    const previewBtn = document.getElementById('previewBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const downloadOptions = document.getElementById('downloadOptions');
    const previewContainer = document.getElementById('previewContainer');
    const thumbnail = document.getElementById('thumbnail');
    const videoTitle = document.getElementById('videoTitle');
    const videoDuration = document.getElementById('videoDuration');
    const platformBtns = document.querySelectorAll('.platform-btn');
    const siteLogo = document.getElementById('siteLogo');

    let currentPlatform = 'youtube';
    let videoInfo = null;

    // URL validation patterns
    const urlPatterns = {
        youtube: /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/,
        facebook: /^(https?:\/\/)?(www\.|m\.)?facebook\.com\/.+/,
        instagram: /^(https?:\/\/)?(www\.)?instagram\.com\/(p|reel)\/.+/
    };

    // Platform selection
    platformBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            platformBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPlatform = btn.dataset.platform;
            // Clear input and reset preview when switching platforms
            videoUrlInput.value = '';
            resetPreview();
            // Update placeholder text based on platform
            videoUrlInput.placeholder = `Paste ${currentPlatform.charAt(0).toUpperCase() + currentPlatform.slice(1)} video URL here...`;
        });
    });

    // Validate URL based on platform
    function validateUrl(url, platform) {
        if (platform === 'facebook') {
            // More detailed Facebook URL validation
            const fbPatterns = [
                /^(https?:\/\/)?(www\.|m\.)?facebook\.com\/.+video\/.+/,
                /^(https?:\/\/)?(www\.|m\.)?facebook\.com\/watch\/\?v=.+/,
                /^(https?:\/\/)?(www\.|m\.)?facebook\.com\/.+videos\/.+/,
                /^(https?:\/\/)?(www\.|m\.)?facebook\.com\/.+posts\/.+/,
                /^(https?:\/\/)?(www\.|m\.)?facebook\.com\/.+story_fbid=.+/,
                /^(https?:\/\/)?(www\.|m\.)?facebook\.com\/.+reels\/.+/,
                /^(https?:\/\/)?(www\.|m\.)?facebook\.com\/.+watch\/.+/,
                /^(https?:\/\/)?(www\.|m\.)?facebook\.com\/.+watch\?v=.+/,
                /^(https?:\/\/)?(www\.|m\.)?facebook\.com\/.+watch\/\?v=.+/,
                /^(https?:\/\/)?(www\.|m\.)?facebook\.com\/.+watch\/\?v=\d+&.+/,
                /^(https?:\/\/)?(www\.|m\.)?facebook\.com\/share\/r\/.+/,  // Share URLs
                /^(https?:\/\/)?(www\.|m\.)?facebook\.com\/share\/.+/,    // Alternative share format
                /^(https?:\/\/)?(www\.|m\.)?facebook\.com\/.+share\/.+/   // Share in path
            ];
            const isValid = fbPatterns.some(pattern => pattern.test(url));
            console.log('Facebook URL validation:', {
                url,
                patterns: fbPatterns.map(p => p.toString()),
                isValid
            });
            return isValid;
        }
        return urlPatterns[platform].test(url);
    }

    // Add preview cache
    const previewCache = new Map();

    // Preview button click
    previewBtn.addEventListener('click', async () => {
        const url = videoUrlInput.value.trim();
        if (!url) {
            showError('Please enter a video URL');
            return;
        }

        if (!validateUrl(url, currentPlatform)) {
            showError(`Please enter a valid ${currentPlatform} video URL`);
            return;
        }

        // Check cache first
        const cacheKey = `${currentPlatform}-${url}`;
        if (previewCache.has(cacheKey)) {
            showPreview(previewCache.get(cacheKey));
            return;
        }

        try {
            previewBtn.disabled = true;
            previewBtn.innerHTML = '<span class="loading"></span> Loading...';
            
            // Show loading state in preview container
            previewContainer.classList.remove('hidden');
            previewContainer.innerHTML = `
                <div class="loading-preview">
                    <div class="loading-spinner"></div>
                    <p>Loading preview...</p>
                </div>
            `;

            // Add timeout to the fetch request
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

            const response = await fetch('http://localhost:8000/preview', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    url,
                    platform: currentPlatform
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to fetch video preview');
            }

            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }

            // Cache the preview data
            previewCache.set(cacheKey, data);
            showPreview(data);
        } catch (error) {
            console.error('Preview error:', error);
            if (error.name === 'AbortError') {
                showError('Preview request timed out. Please try again.');
            } else if (error.message.includes('timed out')) {
                showError('The video preview request timed out. Please try again.');
            } else if (error.message.includes('403')) {
                showError('Access denied. The video might be private or restricted.');
            } else if (error.message.includes('404')) {
                showError('Video not found. The URL might be invalid or the video has been removed.');
            } else {
                showError(error.message || 'Failed to preview video. Please try again.');
            }
            previewContainer.classList.add('hidden');
        } finally {
            previewBtn.disabled = false;
            previewBtn.innerHTML = '<i class="fas fa-search"></i> Preview';
        }
    });

    // Download button click
    downloadBtn.addEventListener('click', async () => {
        const url = videoUrlInput.value.trim();
        if (!url) {
            showError('Please enter a video URL');
            return;
        }

        if (!videoInfo) {
            showError('Please preview the video first');
            return;
        }

        try {
            downloadBtn.disabled = true;
            downloadBtn.innerHTML = '<span class="loading"></span> Processing...';
            
            const downloadResponse = await fetch('http://localhost:8000/download', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    url,
                    platform: currentPlatform,
                    format: 'mp4'
                })
            });

            if (!downloadResponse.ok) {
                const errorData = await downloadResponse.json();
                throw new Error(errorData.detail || 'Failed to download video');
            }

            // Get the filename from the Content-Disposition header
            const contentDisposition = downloadResponse.headers.get('Content-Disposition');
            let filename = 'video.mp4';
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="(.+)"/);
                if (filenameMatch) {
                    filename = filenameMatch[1];
                }
            }

            // Create a blob from the response
            const blob = await downloadResponse.blob();
            
            // Create a download link
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            
            // Clean up
            window.URL.revokeObjectURL(downloadUrl);
            document.body.removeChild(a);

            // Show success message
            showSuccess('Download started!');
        } catch (error) {
            console.error('Download error:', error);
            showError(error.message);
        } finally {
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = '<i class="fas fa-download"></i> Download';
        }
    });

    function showPreview(data) {
        videoInfo = data;
        
        // Create preview content
        const previewContent = document.createElement('div');
        previewContent.className = 'video-info';
        
        // Handle thumbnail display with lazy loading
        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.className = 'thumbnail-container';
        
        if (data.thumbnail) {
            thumbnail.src = data.thumbnail;
            thumbnail.loading = 'lazy'; // Enable lazy loading
            thumbnail.style.display = 'block';
        } else if (data.thumbnails && data.thumbnails.length > 0) {
            const bestThumbnail = data.thumbnails.reduce((best, current) => {
                const currentSize = (current.width || 0) * (current.height || 0);
                const bestSize = (best.width || 0) * (best.height || 0);
                return currentSize > bestSize ? current : best;
            });
            thumbnail.src = bestThumbnail.url;
            thumbnail.loading = 'lazy';
            thumbnail.style.display = 'block';
        } else {
            thumbnail.src = `https://via.placeholder.com/320x180?text=${currentPlatform.charAt(0).toUpperCase() + currentPlatform.slice(1)}+Video`;
            thumbnail.style.display = 'block';
        }
        
        thumbnailContainer.appendChild(thumbnail);
        previewContent.appendChild(thumbnailContainer);

        // Create video details
        const detailsContainer = document.createElement('div');
        detailsContainer.className = 'video-details';
        
        // Add title
        const titleElement = document.createElement('h3');
        titleElement.textContent = data.title || 'Video Title';
        detailsContainer.appendChild(titleElement);
        
        // Add duration if available
        if (data.duration) {
            const durationElement = document.createElement('p');
            durationElement.textContent = `Duration: ${data.duration}`;
            detailsContainer.appendChild(durationElement);
        }

        // Add metadata
        const metaContainer = document.createElement('div');
        metaContainer.className = 'video-meta';
        
        if (data.view_count) {
            metaContainer.innerHTML += `
                <div class="meta-item">
                    <i class="fas fa-eye"></i>
                    <span>${data.view_count} views</span>
                </div>
            `;
        }
        
        if (data.uploader) {
            metaContainer.innerHTML += `
                <div class="meta-item uploader-meta">
                    <i class="fas fa-user"></i>
                    <span class="uploader-name">${data.uploader}</span>
                </div>
            `;
        }
        
        if (data.upload_date) {
            metaContainer.innerHTML += `
                <div class="meta-item">
                    <i class="fas fa-calendar"></i>
                    <span>${data.upload_date}</span>
                </div>
            `;
        }

        detailsContainer.appendChild(metaContainer);
        previewContent.appendChild(detailsContainer);

        // Clear and update preview container
        previewContainer.innerHTML = '';
        previewContainer.appendChild(previewContent);
        
        // Add download button
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'preview-actions';
        actionsContainer.innerHTML = `
            <button id="downloadBtn" class="btn-primary">
                <i class="fas fa-download"></i> Download
            </button>
        `;
        previewContainer.appendChild(actionsContainer);
        
        // Reattach event listener to the new download button
        const newDownloadBtn = document.getElementById('downloadBtn');
        newDownloadBtn.addEventListener('click', async () => {
            const url = videoUrlInput.value.trim();
            if (!url) {
                showError('Please enter a video URL');
                return;
            }

            if (!videoInfo) {
                showError('Please preview the video first');
                return;
            }

            try {
                newDownloadBtn.disabled = true;
                newDownloadBtn.innerHTML = '<span class="loading"></span> Processing...';
                
                const downloadResponse = await fetch('http://localhost:8000/download', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ 
                        url,
                        platform: currentPlatform,
                        format: 'mp4'
                    })
                });

                if (!downloadResponse.ok) {
                    const errorData = await downloadResponse.json();
                    throw new Error(errorData.detail || 'Failed to download video');
                }

                // Get the filename from the Content-Disposition header
                const contentDisposition = downloadResponse.headers.get('Content-Disposition');
                let filename = 'video.mp4';
                if (contentDisposition) {
                    const filenameMatch = contentDisposition.match(/filename="(.+)"/);
                    if (filenameMatch) {
                        filename = filenameMatch[1];
                    }
                }

                // Create a blob from the response
                const blob = await downloadResponse.blob();
                
                // Create a download link
                const downloadUrl = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                
                // Clean up
                window.URL.revokeObjectURL(downloadUrl);
                document.body.removeChild(a);

                // Show success message
                showSuccess('Download started!');
            } catch (error) {
                console.error('Download error:', error);
                showError(error.message);
            } finally {
                newDownloadBtn.disabled = false;
                newDownloadBtn.innerHTML = '<i class="fas fa-download"></i> Download';
            }
        });
        
        previewContainer.classList.remove('hidden');
        previewContainer.style.animation = 'fadeInUp 0.5s ease';
    }

    function resetPreview() {
        previewContainer.classList.add('hidden');
        downloadOptions.classList.add('hidden');
        videoInfo = null;
    }

    function showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.innerHTML = `
            <i class="fas fa-exclamation-circle"></i>
            <span>${message}</span>
        `;
        
        downloadOptions.innerHTML = '';
        downloadOptions.classList.remove('hidden');
        downloadOptions.appendChild(errorDiv);

        // Remove error message after 3 seconds
        setTimeout(() => {
            errorDiv.style.opacity = '0';
            setTimeout(() => {
                downloadOptions.classList.add('hidden');
            }, 300);
        }, 3000);
    }

    function showDownloadOptions(data) {
        downloadOptions.innerHTML = '';
        downloadOptions.classList.remove('hidden');

        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'options-container';

        if (data.formats) {
            data.formats.forEach(format => {
                const option = document.createElement('div');
                option.className = 'download-option';
                option.innerHTML = `
                    <div class="format-info">
                        <span class="quality">${format.quality}</span>
                        <span class="format">${format.format}</span>
                    </div>
                    <button class="btn-download" data-url="${format.url}">
                        <i class="fas fa-download"></i> Download
                    </button>
                `;
                optionsContainer.appendChild(option);
            });
        }

        downloadOptions.appendChild(optionsContainer);

        // Add click handlers for download buttons
        document.querySelectorAll('.btn-download').forEach(btn => {
            btn.addEventListener('click', () => {
                const url = btn.dataset.url;
                window.location.href = url;
            });
        });
    }

    // Add paste button functionality with platform validation
    const pasteBtn = document.querySelector('.btn-paste');
    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (validateUrl(text, currentPlatform)) {
                videoUrlInput.value = text;
            } else {
                showError(`Please paste a valid ${currentPlatform} video URL`);
            }
        } catch (err) {
            showError('Failed to paste from clipboard');
        }
    });

    // Add input validation on paste
    videoUrlInput.addEventListener('paste', (e) => {
        const pastedText = e.clipboardData.getData('text');
        if (!validateUrl(pastedText, currentPlatform)) {
            e.preventDefault();
            showError(`Please paste a valid ${currentPlatform} video URL`);
        }
    });

    // Debounce function to limit API calls
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Smooth scroll for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Add active class to nav links on scroll
    window.addEventListener('scroll', () => {
        const sections = document.querySelectorAll('section');
        const navLinks = document.querySelectorAll('.nav-links a');
        
        let current = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            if (pageYOffset >= sectionTop - 60) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href').substring(1) === current) {
                link.classList.add('active');
            }
        });
    });

    // Add animation to feature cards
    const featureCards = document.querySelectorAll('.feature-card');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.1 });

    featureCards.forEach(card => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'all 0.5s ease';
        observer.observe(card);
    });

    // Add success message function
    function showSuccess(message) {
        const successDiv = document.createElement('div');
        successDiv.className = 'success-message';
        successDiv.innerHTML = `
            <i class="fas fa-check-circle"></i>
            <span>${message}</span>
        `;
        
        downloadOptions.innerHTML = '';
        downloadOptions.classList.remove('hidden');
        downloadOptions.appendChild(successDiv);

        // Remove success message after 3 seconds
        setTimeout(() => {
            successDiv.style.opacity = '0';
            setTimeout(() => {
                downloadOptions.classList.add('hidden');
            }, 300);
        }, 3000);
    }

    if (siteLogo) {
        siteLogo.addEventListener('click', function(e) {
            if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
            // Otherwise, let the link work as normal (navigate to /)
        });
    }
});
