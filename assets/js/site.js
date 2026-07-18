(() => {
  "use strict";

  const year = document.querySelector("#current-year");
  if (year) {
    year.textContent = String(new Date().getFullYear());
  }

  const header = document.querySelector(".site-header");
  const updateHeader = () => {
    header?.classList.toggle("scrolled", window.scrollY >= 400);
  };
  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const motionStatus = document.querySelector("#motion-status");
  const regions = [...document.querySelectorAll("[data-motion-region]")]
    .map((element) => ({
      element,
      media: element.querySelector("video"),
      button: element.querySelector(".motion-toggle"),
      inView: false,
      playPending: false
    }))
    .filter(({ media, button }) => media && button);

  let pausedByUser = false;
  let reducedMotionOverride = false;
  let playbackVersion = 0;
  const scrambleIntervals = new Map();

  const stopScrambles = () => {
    document.querySelectorAll(".scramble-effect").forEach((element) => {
      const interval = scrambleIntervals.get(element);
      if (interval) {
        window.clearInterval(interval);
        scrambleIntervals.delete(element);
      }
      if (element.dataset.originalText) {
        element.textContent = element.dataset.originalText;
      }
    });
  };

  const mayPlayMotion = () => (
    !document.hidden
    && !pausedByUser
    && (!reducedMotion.matches || reducedMotionOverride)
  );

  const shouldPlay = (region) => mayPlayMotion() && region.inView;

  const motionIsActive = () => regions.some(({ media, playPending }) => (
    playPending || (!media.paused && !media.ended)
  ));

  const updateMotionInterface = (announce = false) => {
    const active = motionIsActive();
    document.body.classList.toggle("motion-playing", active);

    regions.forEach(({ button }) => {
      const label = button.querySelector("[data-motion-label]");
      button.dataset.motionState = active ? "playing" : "paused";
      if (label) {
        label.textContent = active ? "Pause animations" : "Play animations";
      }
    });

    if (announce && motionStatus) {
      motionStatus.textContent = active
        ? "Decorative animations are playing."
        : "Decorative animations are paused.";
    }
  };

  const pauseRegion = (region) => {
    region.playPending = false;
    if (!region.media.paused) {
      region.media.pause();
    }
  };

  const syncPlayback = (announce = false) => {
    const version = ++playbackVersion;
    const pending = [];

    regions.forEach((region) => {
      if (!shouldPlay(region)) {
        pauseRegion(region);
        return;
      }

      if (!region.media.paused) {
        region.playPending = false;
        return;
      }

      region.playPending = true;
      let playResult;
      try {
        playResult = region.media.play();
      } catch {
        playResult = Promise.reject(new Error("Playback was rejected"));
      }

      pending.push(
        Promise.resolve(playResult)
          .then(() => {
            region.playPending = false;
            if (version !== playbackVersion || !shouldPlay(region)) {
              pauseRegion(region);
            }
          })
          .catch(() => {
            region.playPending = false;
            pauseRegion(region);
          })
      );
    });

    updateMotionInterface(false);
    Promise.allSettled(pending).then(() => {
      if (version === playbackVersion) {
        updateMotionInterface(announce);
      }
    });
  };

  const setRegionVisibility = (region, intersectionRatio, isIntersecting) => {
    region.inView = isIntersecting && intersectionRatio >= 0.5;
  };

  const measureRegionVisibility = (region) => {
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const rect = region.element.getBoundingClientRect();
    const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
    const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
    const area = Math.max(1, rect.width * rect.height);
    setRegionVisibility(region, (visibleWidth * visibleHeight) / area, visibleWidth > 0 && visibleHeight > 0);
  };

  if (regions.length > 0) {
    regions.forEach((region) => {
      const { button, media } = region;
      button.hidden = false;
      button.addEventListener("click", () => {
        if (motionIsActive()) {
          pausedByUser = true;
          playbackVersion += 1;
          regions.forEach(pauseRegion);
          stopScrambles();
          updateMotionInterface(true);
          return;
        }

        pausedByUser = false;
        if (reducedMotion.matches) {
          reducedMotionOverride = true;
        }
        if (!region.inView) {
          region.element.scrollIntoView({ behavior: "instant", block: "center", inline: "center" });
          measureRegionVisibility(region);
        }
        syncPlayback(true);
      });

      for (const eventName of ["playing", "pause", "ended"]) {
        media.addEventListener(eventName, () => updateMotionInterface(false));
      }
    });

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const region = regions.find(({ element }) => element === entry.target);
          if (region) {
            setRegionVisibility(region, entry.intersectionRatio, entry.isIntersecting);
          }
        });
        syncPlayback(false);
      }, { threshold: [0, 0.5, 1] });

      regions.forEach(({ element }) => observer.observe(element));
    } else {
      const updateFallbackVisibility = () => {
        regions.forEach(measureRegionVisibility);
        syncPlayback(false);
      };

      updateFallbackVisibility();
      window.addEventListener("scroll", updateFallbackVisibility, { passive: true });
      window.addEventListener("resize", updateFallbackVisibility);
    }

    const handleMotionPreference = (event) => {
      if (event.matches) {
        reducedMotionOverride = false;
        playbackVersion += 1;
        regions.forEach(pauseRegion);
        stopScrambles();
        updateMotionInterface(true);
      } else {
        reducedMotionOverride = false;
        syncPlayback(false);
      }
    };

    if (typeof reducedMotion.addEventListener === "function") {
      reducedMotion.addEventListener("change", handleMotionPreference);
    } else {
      reducedMotion.addListener(handleMotionPreference);
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        playbackVersion += 1;
        regions.forEach(pauseRegion);
        updateMotionInterface(false);
      } else {
        syncPlayback(false);
      }
    });

    window.addEventListener("pagehide", () => {
      playbackVersion += 1;
      regions.forEach(pauseRegion);
    });

    updateMotionInterface(false);
  }

  const shuffleWord = (word) => {
    const letters = [...word];
    for (let index = letters.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [letters[index], letters[randomIndex]] = [letters[randomIndex], letters[index]];
    }
    return letters.join("");
  };

  document.querySelectorAll(".scramble-effect").forEach((element) => {
    const originalText = element.textContent;
    element.dataset.originalText = originalText;

    element.addEventListener("pointerenter", () => {
      if (reducedMotion.matches || pausedByUser || scrambleIntervals.has(element)) {
        return;
      }

      let frame = 0;
      const interval = window.setInterval(() => {
        if (frame >= originalText.length) {
          window.clearInterval(interval);
          scrambleIntervals.delete(element);
          element.textContent = originalText;
          return;
        }

        element.textContent = shuffleWord(originalText);
        frame += 1;
      }, 50);

      scrambleIntervals.set(element, interval);
    });

    element.addEventListener("pointerleave", () => {
      const interval = scrambleIntervals.get(element);
      if (interval) {
        window.clearInterval(interval);
        scrambleIntervals.delete(element);
      }
      element.textContent = originalText;
    });
  });
})();
