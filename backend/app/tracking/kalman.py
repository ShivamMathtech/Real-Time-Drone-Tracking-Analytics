import numpy as np


class PositionKalman:
    """Constant velocity filter in image pixels and seconds; variable timestep."""

    def __init__(self, x: float, y: float):
        self.state = np.array([x, y, 0.0, 0.0])
        self.P = np.diag([25.0, 25.0, 400.0, 400.0])
        self.H = np.array([[1.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0]])

    def predict(self, dt: float):
        dt = max(1e-4, min(dt, 10))
        F = np.array([[1, 0, dt, 0], [0, 1, 0, dt], [0, 0, 1, 0], [0, 0, 0, 1]], float)
        G = np.array([[dt * dt / 2, 0], [0, dt * dt / 2], [dt, 0], [0, dt]])
        self.state = F @ self.state
        self.P = F @ self.P @ F.T + G @ G.T * 16
        return self.state.copy()

    def update(self, x: float, y: float):
        innovation = np.array([x, y]) - self.H @ self.state
        K = np.linalg.solve(
            self.H @ self.P @ self.H.T + np.eye(2) * 4, self.H @ self.P
        ).T
        self.state += K @ innovation
        I = np.eye(4) - K @ self.H
        self.P = I @ self.P @ I.T + K @ (np.eye(2) * 4) @ K.T
        return self.state.copy()
