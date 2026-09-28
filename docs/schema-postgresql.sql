CREATE TABLE sessions (
	id VARCHAR(36) NOT NULL, 
	name VARCHAR(120) NOT NULL, 
	started_at FLOAT NOT NULL, 
	ended_at FLOAT, 
	source VARCHAR(40) NOT NULL, 
	model VARCHAR(180) NOT NULL, 
	algorithm VARCHAR(40) NOT NULL, 
	saved BOOLEAN NOT NULL, 
	frame_count INTEGER NOT NULL, 
	metadata JSON NOT NULL, 
	statistics JSON NOT NULL, 
	PRIMARY KEY (id)
);

CREATE TABLE settings (
	key VARCHAR(80) NOT NULL, 
	value JSON NOT NULL, 
	PRIMARY KEY (key)
);

CREATE TABLE events (
	id SERIAL NOT NULL, 
	session_id VARCHAR(36) NOT NULL, 
	timestamp FLOAT NOT NULL, 
	level VARCHAR(12) NOT NULL, 
	message TEXT NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(session_id) REFERENCES sessions (id) ON DELETE CASCADE
);

CREATE INDEX ix_events_session_id ON events (session_id);

CREATE TABLE frames (
	session_id VARCHAR(36) NOT NULL, 
	frame_index INTEGER NOT NULL, 
	timestamp FLOAT NOT NULL, 
	packet JSON NOT NULL, 
	has_image BOOLEAN NOT NULL, 
	PRIMARY KEY (session_id, frame_index), 
	FOREIGN KEY(session_id) REFERENCES sessions (id) ON DELETE CASCADE
);

CREATE TABLE telemetry (
	id SERIAL NOT NULL, 
	session_id VARCHAR(36) NOT NULL, 
	timestamp FLOAT NOT NULL, 
	data JSON NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(session_id) REFERENCES sessions (id) ON DELETE CASCADE
);

CREATE INDEX ix_telemetry_session_id ON telemetry (session_id);

CREATE TABLE track_points (
	id SERIAL NOT NULL, 
	session_id VARCHAR(36) NOT NULL, 
	track_id INTEGER NOT NULL, 
	timestamp FLOAT NOT NULL, 
	data JSON NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(session_id) REFERENCES sessions (id) ON DELETE CASCADE
);

CREATE INDEX ix_track_points_track_id ON track_points (track_id);

CREATE INDEX ix_track_points_session_id ON track_points (session_id);

CREATE TABLE tracks (
	session_id VARCHAR(36) NOT NULL, 
	track_id INTEGER NOT NULL, 
	class_name VARCHAR(30) NOT NULL, 
	first_seen FLOAT NOT NULL, 
	last_seen FLOAT NOT NULL, 
	PRIMARY KEY (session_id, track_id), 
	FOREIGN KEY(session_id) REFERENCES sessions (id) ON DELETE CASCADE
);
