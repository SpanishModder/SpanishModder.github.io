/* ── TYPEWRITER EFFECT ────────────────────── */
const roles = [
	'Game developer',
	'Web depeloper',
	'Back-end Enthusiast',
	'Open Source Builder',
];
let roleIdx = 0, charIdx = 0, deleting = false;
const tw = document.getElementById('typewriter');

function typeWriter() {
	const current = roles[roleIdx];
	if (!deleting) {
		tw.textContent = current.slice(0, ++charIdx);
		if (charIdx === current.length) {
			setTimeout(() => { deleting = true; }, 2000);
			setTimeout(typeWriter, 2100);
			return;
		}
	} else {
		tw.textContent = current.slice(0, --charIdx);
		if (charIdx === 0) {
			deleting = false;
			roleIdx = (roleIdx + 1) % roles.length;
		}
	}
	setTimeout(typeWriter, deleting ? 60 : 100);
}
typeWriter();

/* ── SCROLL REVEAL ────────────────────────── */
const observer = new IntersectionObserver(entries => {
	entries.forEach(e => {
		if (e.isIntersecting) {
			e.target.classList.add('visible');
			// animate skill bars when they appear
			const bars = e.target.querySelectorAll('.skill-fill[data-width]');
			bars.forEach(bar => {
				bar.style.width = bar.dataset.width + '%';
			});
		}
	});
}, { threshold: 0.1 });

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

/* also observe skill categories for bar animation */
document.querySelectorAll('.skill-category').forEach(cat => {
	const catObserver = new IntersectionObserver(entries => {
		entries.forEach(e => {
			if (e.isIntersecting) {
				e.target.querySelectorAll('.skill-fill[data-width]').forEach(bar => {
					setTimeout(() => { bar.style.width = bar.dataset.width + '%'; }, 300);
				});
			}
		});
	}, { threshold: 0.3 });
	catObserver.observe(cat);
});

/* ── FORM HANDLER ─────────────────────────── */
function handleSubmit(e) {
	e.preventDefault();
	const status = document.getElementById('form-status');
	status.style.color = 'var(--yellow)';
	status.textContent = 'Sending...';
	setTimeout(() => {
		status.style.color = 'var(--green)';
		status.textContent = '> Message Sended! Thank you!';
		e.target.reset();
	}, 1200);
}

/* ── ACTIVE NAV LINK ──────────────────────── */
const sections = document.querySelectorAll('section[id], div[id]');
const navLinks = document.querySelectorAll('.nav-links a');

window.addEventListener('scroll', () => {
	let current = '';
	sections.forEach(s => {
		if (window.scrollY >= s.offsetTop - 120) current = s.id;
	});
	navLinks.forEach(a => {
		a.style.color = a.getAttribute('href') === '#' + current
			? 'var(--cyan)' : '';
	});
});