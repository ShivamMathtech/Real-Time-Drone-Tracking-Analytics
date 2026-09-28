import logging
import time
from collections import deque
from threading import Lock


class EventLog:
    def __init__(self):
        self.items = deque(maxlen=1500)
        self.lock = Lock()
        self.counter = 0
        self.sink = None
        self.logger = logging.getLogger("dronevision")

    def add(self, message, level="INFO", category="system"):
        with self.lock:
            self.counter += 1
            item = dict(
                id=self.counter,
                timestamp=time.time(),
                level=level,
                category=category,
                message=message,
            )
            self.items.append(item)
        getattr(
            self.logger, {"WARNING": "warning", "ERROR": "error"}.get(level, "info")
        )(message)
        if self.sink:
            try:
                self.sink(item)
            except Exception:
                self.logger.exception("Could not persist event")
        return item

    def get(self, level=None, after=0):
        with self.lock:
            return [
                dict(x)
                for x in self.items
                if x["id"] > after and (not level or x["level"] == level)
            ]
