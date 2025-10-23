"""Sound effects playback utilities"""

import logging
import soundfile as sf
import sounddevice as sd
from pathlib import Path
from typing import Dict

log = logging.getLogger(__name__)


class SoundEffects:
    """Manage and play sound effects"""

    def __init__(self, sounds_dir: Path, enabled: bool = True):
        """
        Initialize sound effects manager

        Args:
            sounds_dir: Directory containing sound effect files
            enabled: Whether sound effects are enabled
        """
        self.sounds_dir = sounds_dir
        self.enabled = enabled
        self.sounds: Dict[str, Path] = {}

        self._load_sounds()

    def _load_sounds(self):
        """Load sound file paths"""
        sound_files = {
            "wake_word": "wake-word.mp3",
            "wake": "wake.mp3",
            "tool": "tool.mp3",
            "wait": "wait.mp3",
            "sleep": "sleep.mp3",
        }

        for name, filename in sound_files.items():
            path = self.sounds_dir / filename
            if path.exists():
                self.sounds[name] = path
            else:
                log.warning(f"Sound file not found: {path}")

    def play(self, sound_name: str, blocking: bool = False) -> bool:
        """
        Play a sound effect

        Args:
            sound_name: Name of the sound to play (wake_word, wake, tool, wait, sleep)
            blocking: If True, wait for playback to complete

        Returns:
            True if sound was played successfully
        """
        if not self.enabled:
            return False

        if sound_name not in self.sounds:
            log.warning(f"Sound '{sound_name}' not available")
            return False

        sound_path = self.sounds[sound_name]

        try:
            data, samplerate = sf.read(sound_path)
            sd.play(data, samplerate, blocking=blocking)
            return True
        except Exception as e:
            log.error(f"Error playing sound '{sound_name}': {e}")
            return False

    def play_wake_word(self, blocking: bool = False):
        """Play wake word detected sound"""
        self.play("wake_word", blocking)

    def play_wake(self, blocking: bool = True):
        """Play wake/ready sound"""
        self.play("wake", blocking)

    def play_tool(self, blocking: bool = False):
        """Play tool use sound"""
        self.play("tool", blocking)

    def play_wait(self, blocking: bool = False):
        """Play waiting sound"""
        self.play("wait", blocking)

    def play_sleep(self, blocking: bool = True):
        """Play sleep/goodbye sound"""
        self.play("sleep", blocking)

    def enable(self):
        """Enable sound effects"""
        self.enabled = True

    def disable(self):
        """Disable sound effects"""
        self.enabled = False
