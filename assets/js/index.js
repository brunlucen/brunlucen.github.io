

[...document.querySelectorAll('.grid')].forEach(grid => new SpreadGrid(grid));

// Preload images
preloadImages('.grid__item-img').then( _ => document.body.classList.remove('loading'));

// Function to shuffle the letters of a word
function shuffleWord(word) {
  const letters = word.split('');
  letters.sort(() => Math.random() - 0.5);
  return letters.join('');
}

// Select all elements with the scramble-effect class
document.querySelectorAll('.scramble-effect').forEach(el => {
  const originalText = el.textContent; // Store the original text

  el.addEventListener('mouseenter', () => {
    let frame = 0;
    const duration = 50; // Update speed in milliseconds
    const maxFrames = originalText.length; // Can adjust max frames for a longer/shorter effect

    // Use setInterval to repeatedly update the text content
    const intervalId = setInterval(() => {
      if (frame < maxFrames) {
        el.textContent = shuffleWord(originalText);
        frame++;
      } else {
        clearInterval(intervalId); // Stop the animation
        el.textContent = originalText; // Revert to original text
      }
    }, duration);

    // Store interval ID on the element to clear on mouseleave (optional but useful)
    el.dataset.intervalId = intervalId; 
  });

  el.addEventListener('mouseleave', () => {
    // Clear the interval when the mouse leaves the element
    clearInterval(el.dataset.intervalId);
    el.textContent = originalText; // Ensure original text is restored
  });
});