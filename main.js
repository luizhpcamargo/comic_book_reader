
// Copyright (c) 2015 Matthew Brennan Jones <matthew.brennan.jones@gmail.com>
// This software is licensed under GPL v3 or later
// http://github.com/workhorsy/comic_book_reader

var g_entries = [];
var g_images = [];
var g_image_index = 0;
var g_moving_panel = null;
var g_is_mouse_down = false;
var g_mouse_start_x = 0;
var g_mouse_start_y = 0;
var g_is_vertical = false;
var g_screen_width = 0;
var g_is_swiping_right = false;
var g_is_swiping_left = false;
var g_top_visible = 1.0;
var g_left = null;
var g_middle = null;
var g_right = null;
var g_scroll_y_temp = 0;
var g_scroll_y_start = 0;
var g_needs_resize = false;
var g_file_name = null;

function toFrieldlySize(size) {
	if (size >= 1024000000) {
		return (size / 1024000000).toFixed(2) + ' GB';
	} else if (size >= 1024000) {
		return (size / 1024000).toFixed(2) + ' MB';
	} else if (size >= 1024) {
		return (size / 1024).toFixed(2) + ' KB';
	} else if (size >= 1) {
		return (size / 1).toFixed(2) + ' B';
	}

	return '?';
}

function blobToDataURI(blob, cb) {
	var reader = new FileReader();
	reader.onload = function(e) {
		cb(e.target.result);
	};
	reader.readAsDataURL(blob);
}

function isValidImageType(file_name) {
	file_name = file_name.toLowerCase();
	return file_name.endsWith('.jpeg') ||
			file_name.endsWith('.jpg') ||
			file_name.endsWith('.png') ||
			file_name.endsWith('.bmp');
}

function hideTopPanel(is_instant) {
	var speed = is_instant ? '0.0s' : '0.3s';
	var height = $('#topPanel').outerHeight() + 10;
	var style = $('#topPanel')[0].style;
	style.transitionDuration = speed;
	style.transform = 'translate3d(0px, -' + height + 'px, 0px)';
	g_top_visible = 0.0;
}

function showTopPanel(y_offset, is_instant) {
	var speed = is_instant ? '0.0s' : '0.2s';
	var height = $('#topPanel').outerHeight();
	var offset = -height + (height * y_offset);
	var style = $('#topPanel')[0].style;
	style.transitionDuration = speed;
	style.transform = 'translate3d(0px, ' + offset + 'px, 0px)';
	style.width = (g_screen_width - 80) + 'px';
	g_top_visible = y_offset;
}

function loadComic() {
	var file_input = $('#fileInput');

	// Just return if there is no file selected
	if (file_input[0].files.length === 0) {
		return;
	}

	// Load the file's info
	clearComicData();
	var file = file_input[0].files[0];
	setComicData(file.name, file.size, file.type);

	// Read the file
	onProgress(1, 1);
	$('#loadProgress').hide();
	$('#comicPanel').show();

	hideTopPanel(false);

	var blob = file.slice();
	onLoaded(blob);
}

function friendlyPageNumber() {
	return '(' + (g_image_index + 1) + ' of ' + g_images.length + ')';
}

function replaceIfDifferentImage(parent, image) {
	var children = parent.children();
	if (children.length === 0) {
		parent.append(image);
	} else if (children.length && children[0].id !== image.id) {
		parent.empty();
		parent.append(image);
	}
}

function loadCurrentPage() {
	// Load the middle page
	updatePageCache(g_image_index);
	replaceIfDifferentImage(g_middle, g_images[g_image_index]);
	var page = friendlyPageNumber();
	$('#pageOverlay')[0].innerHTML = page;
	document.title = page + ' "' + g_file_name + '" - Comic Book Reader';

	// Load right page
	if (g_image_index === g_images.length -1) {
		g_right.empty();
	} else if (g_image_index < g_images.length -1) {
		updatePageCache(g_image_index + 1);
		replaceIfDifferentImage(g_right, g_images[g_image_index + 1]);
	}

	// Load left page
	if (g_image_index === 0) {
		g_left.empty();
	} else if (g_image_index > 0) {
		updatePageCache(g_image_index - 1);
		replaceIfDifferentImage(g_left, g_images[g_image_index - 1]);
	}

	updateScrollBar();
}

function updatePageCache(index) {
	var img = g_images[index];
	if (img.is_loaded) {
		console.info('!!! Cached page: ' + index + ', ' + img.title);
	} else {
		var entry = g_entries[index];
		var entry_index = entry.index;
		entry.getData(new zip.BlobWriter(), function(blob) {
	//		console.info(entry.filename);
	//		console.info(blob);
			blobToDataURI(blob, function(data_uri) {
				// Load the blob into an image
				var img = g_images[entry_index];
				img.src = data_uri;
				img.is_loaded = true;
				console.info('Loaded page: ' + index + ', ' + img.title);
			});
		});
	}
}

function setComicData(name, size, type) {
	g_file_name = name;
	$('#comicData').show();
	$('#nameValue').text(name);
	$('#sizeValue').text(toFrieldlySize(size));
	//$('#typeValue').text(type);
}

function clearComicData() {
	// Reset the UI
	$('#loadError').hide();
	$('#comicData').hide();
	$('#loadProgress').val(0);
	setComicData('?', '?', '?');

	// Remove all the old images and compressed file entries
	g_middle.empty();
	g_left.empty();
	g_right.empty();
	g_image_index = 0;
	g_images = [];
	g_entries = [];
	g_scroll_y_temp = 0;
	g_scroll_y_start = 0;
}

function onLoaded(blob) {
	var reader = new zip.BlobReader(blob);
	zip.createReader(reader, function(reader) {
		reader.getEntries(function(entries) {
			// Get only the entries that are valid images
			g_entries = [];
			entries.forEach(function(entry) {
				if (! entry.directory && isValidImageType(entry.filename)) {
					g_entries.push(entry);
				}
			});

			// Sort the entries by their file names
			g_entries.sort(function(a, b){
				if(a.filename < b.filename) return -1;
				if(a.filename > b.filename) return 1;
				return 0;
			});

			// Create empty images for each page
			var i = 0;
			g_entries.forEach(function(entry) {
				var img = document.createElement('img');
				img.id = 'page_' + i;
				img.title = entry.filename;
				img.className = 'comicImage';
				img.ondragstart = function() { return false; }
				img.onload = function() {
					if (g_needs_resize) {
						onResize(g_screen_width);
					}
				};
				img.draggable = 'false';
				g_images.push(img);
				entry.index = i;
				i++;
			});

			g_image_index = 0;
			loadCurrentPage();
			var width = $(window).width();
			onResize(width);
		});
	}, function(e) {
		onError('Failed to read file!');
	});
}

function onError(msg) {
	$('#comicPanel').hide();
	$('#comicData').hide();
	$('#loadError').text('Error: ' + msg);
	$('#loadError').show();
	showTopPanel(1.0, true);
}

function onProgress(loaded, total) {
	$('#loadProgress').show();
	$('#loadProgress').val(loaded / total);
}

function largestNumber(a, b, c) {
	var larger = a > b ? a : b;
	larger = larger > c ? larger : c;
	return larger;
}

function largestPageNaturalHeight() {
	var left_children = g_left.children();
	var middle_children = g_middle.children();
	var right_children = g_right.children();

	var left_width = left_children.length > 0 ? left_children[0].naturalWidth : 0;
	var middle_width = middle_children.length > 0 ? middle_children[0].naturalWidth : 0;
	var right_width = right_children.length > 0 ? right_children[0].naturalWidth : 0;

	var left_ratio = left_width !== 0 ? g_screen_width / left_width : 0;
	var middle_ratio = middle_width !== 0 ? g_screen_width / middle_width : 0;
	var right_ratio = right_width !== 0 ? g_screen_width / right_width : 0;

	var left_height = left_children.length > 0 ? left_ratio * left_children[0].naturalHeight : 0;
	var middle_height = middle_children.length > 0 ? middle_ratio * middle_children[0].naturalHeight : 0;
	var right_height =  right_children.length > 0 ?  right_ratio *  right_children[0].naturalHeight : 0;

	return largestNumber(left_height, middle_height, right_height);
}

function onResize(screen_width) {
//	console.info('Resize called ...');
	g_screen_width = screen_width;

	// Move the top panel to the new top
	if (g_top_visible < 1.0) {
		hideTopPanel(true);
	} else {
		showTopPanel(g_top_visible, true);
	}

	// Figure out if the images are loaded yet.
	// If not, we will manually fire the resize event when they do
	var children = g_middle.children();
	if (children.length === 0) {
		g_needs_resize = true;
//		console.info('Needs resize ...');
		return;
	} else if (children[0].naturalWidth === 0) {
		g_needs_resize = true;
//		console.info('Needs resize ...');
		return;
	}

	// Find the largest natural height from the images
	var height = largestPageNaturalHeight();

	// Make the panel as wide as the screen
	g_needs_resize = false;
	$('#comicPanel')[0].style.width = (g_screen_width * 1) + 'px';

	// Make it as wide as the screen and as tall as the tallest image
	var style = $('#pageContainer')[0].style;
	style.width = (g_screen_width * 3) + 'px';
	style.height = height + 'px';
	style.transitionDuration = '0.0s';
	style.transform = 'translate3d(-' + g_screen_width + 'px, 0px, 0px)';

	// Make it as wide as the screen and as tall as the tallest image
	style = $('#pageOverlay')[0].style;
	style.width = g_screen_width + 'px';
	style.height = height + 'px';
	style.transitionDuration = '0.0s';
	style.transform = 'translate3d(' + (1 * g_screen_width) + 'px, 0px, 0px)';

	// Make it as wide as the screen and as tall as the tallest image
	style = g_left[0].style;
	style.width = g_screen_width + 'px';
	style.height = height + 'px';
	style.transitionDuration = '0.0s';
	g_left[0].panel_index = 0;
	style.transform = 'translate3d(' + (g_left[0].panel_index * g_screen_width) + 'px, 0px, 0px)';

	// Make it as wide as the screen and as tall as the tallest image
	style = g_middle[0].style;
	style.width = g_screen_width + 'px';
	style.height = height + 'px';
	style.transitionDuration = '0.0s';
	g_middle[0].panel_index = 1;
	var x = g_middle[0].panel_index * g_screen_width;
	var y = g_scroll_y_temp + g_scroll_y_start;
	style.transform = 'translate3d(' + x + 'px, ' + y + 'px, 0px)';

	// Make it as wide as the screen and as tall as the tallest image
	style = g_right[0].style;
	style.width = g_screen_width + 'px';
	style.height = height + 'px';
	style.transitionDuration = '0.0s';
	g_right[0].panel_index = 2;
	style.transform = 'translate3d(' + (g_right[0].panel_index * g_screen_width) + 'px, 0px, 0px)';

	updateScrollBar();
}

function updateScrollBar() {
	// Get the heights
	var window_height = $(window).height();
	var image_height = $('#' + g_middle.children()[0].id).height();
	if (window_height < 1 || image_height < 1) {
		return;
	}

	// Get the percentage of screen height to image height
	var height_percentage = window_height / image_height;
	if (height_percentage > 1.0) {
		height_percentage = 1.0;
	}

	// Get the percentage of scroll height
	var y = g_scroll_y_temp + g_scroll_y_start;
	var y_percentage = (image_height + y) / image_height;

	// Update the scroll bar size and position
	var scroll_bar = $('#scrollBar');
	style = scroll_bar[0].style;
	style.height = (height_percentage * window_height) + 'px';
	style.top = (window_height - (y_percentage * window_height)) + 'px';

	// Hide the scroll bar if it is at least 98% full size
	if (height_percentage >= 0.98) {
		scroll_bar.hide();
	} else if (scroll_bar.is(':hidden')) {
		scroll_bar.show();
	}
}

$(document).ready(function() {
	// Tell zip.js where it can find the worker js file
	zip.workerScriptsPath = 'js/zip/';

	g_left = $('#pageLeft');
	g_middle = $('#pageMiddle');
	g_right = $('#pageRight');

	// Stop the mouse wheel from scrolling
	$('body').on('mousewheel', function(e) {
		e.preventDefault();
		e.stopPropagation();
	});

	// Resize everything when the browser resizes
	$(window).resize(function(e) {
		var width = $(window).width();
		onResize(width);
	});
	$(window).trigger('resize');

	// Stop the right click menu from popping up
	$(document).on('contextmenu', function(e) {
		e.preventDefault();
	});

	// Toggle full screen
	$('#btnFullScreen').click(function () {
		if (screenfull.enabled) {
			screenfull.toggle();
		}
	});

	// Open github in a new tab
	$('#btnOpenGithub').click(function () {
		var url = "https://github.com/workhorsy/comic_book_reader";
		window.open(url, '_blank');
	});

	g_left.mousedown(function(e) {
		if (this.panel_index === 1) {
			g_moving_panel = this;
		} else {
			g_moving_panel = null;
		}
	});

	g_middle.mousedown(function(e) {
		if (this.panel_index === 1) {
			g_moving_panel = this;
		} else {
			g_moving_panel = null;
		}
	});

	g_right.mousedown(function(e) {
		if (this.panel_index === 1) {
			g_moving_panel = this;
		} else {
			g_moving_panel = null;
		}
	});

	$('body').mousedown(function(e) {
		// Skip if clicking on something that is no touchable
		if (! e.target.hasAttribute('touchable')) {
			return;
		}

		// If the top menu is showing, hide it
		if (e.target.hasAttribute('touchable') && g_top_visible > 0.0) {
			hideTopPanel(false);
			return;
		}

		g_is_mouse_down = true;
		g_mouse_start_x = e.clientX;
		g_mouse_start_y = e.clientY;
	});

	$('body').on('mouseup mouseleave', function(e) {
		if (g_top_visible > 0.0 && g_top_visible < 1.0) {
			hideTopPanel(false);
		}

		if (! g_is_mouse_down) {
			return;
		}
		g_is_mouse_down = false;
		g_moving_panel = null;
		g_scroll_y_start += g_scroll_y_temp;
		g_scroll_y_temp = 0;


		if (g_is_swiping_right) {
			g_is_swiping_right = false;

			var style = g_middle[0].style;
			style.transitionDuration = '0.3s';
			style.transform = 'translate3d(' + (g_screen_width * 2) + 'px, 0px, 0px)';

			style = g_left[0].style;
			style.transitionDuration = '0.3s';
			style.transform = 'translate3d(' + (g_screen_width) + 'px, 0px, 0px)';

			// Update the page orderings, after the pages move into position
			setTimeout(function() {
				var old_left = g_left;
				var old_middle = g_middle;
				var old_right = g_right;
				g_right = old_middle;
				g_middle = old_left;
				g_left = old_right;

				g_left[0].panel_index = 0;
				g_middle[0].panel_index = 1;
				g_right[0].panel_index = 2;

				style = g_left[0].style;
				style.transitionDuration = '0.0s';
				style.transform = 'translate3d(' + (g_left[0].panel_index * g_screen_width) + 'px, 0px, 0px)';
				g_scroll_y_start = 0;

				if (g_image_index > 0) {
					g_image_index--;
					loadCurrentPage();
				}
			}, 300);
		} else if (g_is_swiping_left) {
			g_is_swiping_left = false;

			var style = g_middle[0].style;
			style.transitionDuration = '0.3s';
			style.transform = 'translate3d(0px, 0px, 0px)';

			style = g_right[0].style;
			style.transitionDuration = '0.3s';
			style.transform = 'translate3d(' + (g_screen_width) + 'px, 0px, 0px)';

			// Update the page orderings, after the pages move into position
			setTimeout(function() {
				var old_left = g_left;
				var old_middle = g_middle;
				var old_right = g_right;
				g_left = old_middle;
				g_middle = old_right;
				g_right = old_left;

				g_left[0].panel_index = 0;
				g_middle[0].panel_index = 1;
				g_right[0].panel_index = 2;

				style = g_right[0].style;
				style.transitionDuration = '0.0s';
				style.transform = 'translate3d(' + (g_right[0].panel_index * g_screen_width) + 'px, 0px, 0px)';
				g_scroll_y_start = 0;

				if (g_image_index < g_images.length -1) {
					g_image_index++;
					loadCurrentPage();
				}
			}, 300);
		} else {
			var style = g_left[0].style;
			style.transitionDuration = '0.3s';
			style.transform = 'translate3d(0px, 0px, 0px)';

			var y = g_scroll_y_temp + g_scroll_y_start;
			style = g_middle[0].style;
			style.transitionDuration = '0.3s';
			style.transform = 'translate3d(' + (g_screen_width * 1) + 'px, ' + y + 'px, 0px)';

			style = g_right[0].style;
			style.transitionDuration = '0.3s';
			style.transform = 'translate3d(' + (g_screen_width * 2) + 'px, 0px, 0px)';
		}
	});

	$('body').mousemove(function(e) {
		if (! g_is_mouse_down) {
			return;
		}

		// Figure out if we are moving vertically or horizontally
//		console.info(e.clientX + ', ' + g_mouse_start_x + ', ' + g_moving_panel.panel_index + ', ' + g_moving_panel.id);
		if (Math.abs(e.clientY - g_mouse_start_y) > Math.abs(e.clientX - g_mouse_start_x)) {
			g_is_vertical = true;
		} else {
			g_is_vertical = false;
		}

		// Get how far we have moved since pressing down
//		console.info(g_is_vertical);
//		console.info(e.clientX + ', ' + e.clientY + ', ' + g_is_vertical);
		var x_offset = e.clientX - g_mouse_start_x;
		var y_offset = e.clientY - g_mouse_start_y;
//		console.info(y_offset);

		//console.info(g_mouse_start_y);
//		console.info(g_is_vertical + ', ' + x_offset + ', ' + y_offset);
		if (g_is_vertical && g_moving_panel) {
//			console.info('vertical ...');
			// Show the top panel if we are swiping down from the top
			if (g_mouse_start_y < 200 && y_offset > 0) {
				var y = y_offset > 200.0 ? 200.0 : y_offset;
	//			console.info(y / 200.0);
				showTopPanel(y / 200.0, false);
			// Scroll the page up and down
			} else {
				var window_height = $(window).height();
				var image_height = $('#' + g_moving_panel.children[0].id).height();

				// Only scroll down if the top of the image is above the screen top
				var new_offset = y_offset + g_scroll_y_start;
				if (new_offset <= 0 && image_height + new_offset > window_height) {
					g_scroll_y_temp = y_offset;

					var x = (g_moving_panel.panel_index * g_screen_width);
					var style = g_moving_panel.style;
					style.transitionDuration = '0.0s';
					style.transform = 'translate3d(' + x + 'px, ' + new_offset + 'px, 0px)';

					updateScrollBar();
				}
			}
		}

		// Scroll the comic panels if we are swiping right or left
		if (! g_is_vertical && g_moving_panel) {
			var x = (g_moving_panel.panel_index * g_screen_width) + x_offset;
			var y = g_scroll_y_temp + g_scroll_y_start;
			var style = g_moving_panel.style;
			style.transitionDuration = '0.0s';
			style.transform = 'translate3d(' + x + 'px, ' + y + 'px, 0px)';

			if (x_offset > 0) {
				var x = (g_left[0].panel_index * g_screen_width) + x_offset;
				var style = g_left[0].style;
				style.transitionDuration = '0.0s';
				style.transform = 'translate3d(' + x + 'px, 0px, 0px)';

				if (Math.abs(x_offset) > g_screen_width / 2 && g_image_index > 0) {
	//				console.info(Math.abs(x_offset) + ' > ' + (g_screen_width / 2));
					g_is_swiping_right = true;
				} else {
					g_is_swiping_right = false;
					g_is_swiping_left = false;
				}
			} else {
				var x = (g_right[0].panel_index * g_screen_width) + x_offset;
				var style = g_right[0].style;
				style.transitionDuration = '0.0s';
				style.transform = 'translate3d(' + x + 'px, 0px, 0px)';

				if (Math.abs(x_offset) > g_screen_width / 2 && g_image_index < g_images.length -1) {
	//				console.info(Math.abs(x_offset) + ' > ' + (g_screen_width / 2));
					g_is_swiping_left = true;
				} else {
					g_is_swiping_right = false;
					g_is_swiping_left = false;
				}
			}
		}
	});

	$('#comicPanel').hide();

	// When a file is selected, load it
	$('#fileInput').change(function(e) {
		loadComic();
	});

	// When the button is clicked, click the hidden file load button
	$('#fileLoad').click(function(e) {
		$('#fileInput').click();
	});
	clearComicData();
});