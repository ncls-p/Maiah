import { z } from "zod";
import { SlideDeckInput } from "./slide-deck-tool.slide-deck-input-schema";
import {
  createSlideDeckCss,
  createSlideDeckHtml,
} from "./slide-deck-tool.create-slide-deck-html";

function createSlideDeckJs() {
  return `(function () {
	const root = document.querySelector('[data-deck]');
	if (!root) return;
	const slides = Array.from(root.querySelectorAll('[data-slide]'));
	const counter = root.querySelector('[data-counter]');
	const progress = root.querySelector('[data-progress]');
	const stage = root.querySelector('.deck-stage');
	const animation = root.getAttribute('data-animation') || 'rise';
	let slideIndex = 0;
	let fragmentIndex = animation === 'none' ? Number.POSITIVE_INFINITY : 0;

	function fragmentsFor(slide) {
		return Array.from(slide.querySelectorAll('[data-fragment]'));
	}

	function clampState() {
		slideIndex = Math.max(0, Math.min(slideIndex, slides.length - 1));
		const count = fragmentsFor(slides[slideIndex]).length;
		if (animation === 'none') {
			fragmentIndex = count;
		} else {
			fragmentIndex = Math.max(0, Math.min(fragmentIndex, count));
		}
	}

	function render() {
		clampState();
		slides.forEach((slide, index) => {
			const active = index === slideIndex;
			slide.classList.toggle('is-active', active);
			fragmentsFor(slide).forEach((fragment, fragmentPosition) => {
				fragment.classList.toggle('is-visible', !active || fragmentPosition < fragmentIndex || animation === 'none');
			});
		});
		if (counter) counter.textContent = (slideIndex + 1) + ' / ' + slides.length;
		if (progress) progress.style.width = slides.length <= 1 ? '100%' : String((slideIndex / (slides.length - 1)) * 100) + '%';
	}

	function next() {
		const fragments = fragmentsFor(slides[slideIndex]);
		if (animation !== 'none' && fragmentIndex < fragments.length) {
			fragmentIndex += 1;
		} else if (slideIndex < slides.length - 1) {
			slideIndex += 1;
			fragmentIndex = animation === 'none' ? Number.POSITIVE_INFINITY : 0;
		}
		render();
	}

	function previous() {
		if (animation !== 'none' && fragmentIndex > 0) {
			fragmentIndex -= 1;
		} else if (slideIndex > 0) {
			slideIndex -= 1;
			fragmentIndex = animation === 'none' ? Number.POSITIVE_INFINITY : fragmentsFor(slides[slideIndex]).length;
		}
		render();
	}

	root.addEventListener('click', (event) => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		const action = target.closest('[data-action]');
		if (action) {
			const name = action.getAttribute('data-action');
			if (name === 'next') next();
			if (name === 'prev') previous();
			if (name === 'print') window.print();
			return;
		}
		if (target.closest('a, button')) return;
		next();
	});

	document.addEventListener('keydown', (event) => {
		if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
			event.preventDefault();
			next();
		}
		if (event.key === 'ArrowLeft' || event.key === 'PageUp' || event.key === 'Backspace') {
			event.preventDefault();
			previous();
		}
		if (event.key === 'Home') {
			slideIndex = 0;
			fragmentIndex = 0;
			render();
		}
		if (event.key === 'End') {
			slideIndex = slides.length - 1;
			fragmentIndex = fragmentsFor(slides[slideIndex]).length;
			render();
		}
	});

	stage && stage.focus({ preventScroll: true });
	render();
})();`;
}

export function createSlideDeckArtifact(input: SlideDeckInput) {
  return {
    kind: "html_artifact" as const,
    title: input.title,
    html: createSlideDeckHtml(input),
    css: createSlideDeckCss(input),
    js: createSlideDeckJs(),
    height: input.height,
    deck: input,
    exportNotes:
      "Use the PDF button or browser print dialog to export a static PDF. Click animations stay interactive in the HTML artifact; PDF viewers generally do not preserve JavaScript slide-step animations.",
  };
}
