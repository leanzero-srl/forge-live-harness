#!/usr/bin/env python3
"""Exclusive profile reservation. Never deletes Chrome markers or the lock inode.

A durable active record survives either process dying before Chrome writes markers.
Only the same live holder's explicit clean-close message can return it to idle.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import stat
import sys


def emit(kind, **data):
    print(json.dumps({'kind': kind, **data}), flush=True)


def main():
    profile, root, token, parent_pid = sys.argv[1:]
    profile = os.path.realpath(profile)
    root = os.path.realpath(root)
    if os.path.commonpath([root, profile]) == profile:
        raise ValueError('Reservation directory must be outside the browser profile')
    os.makedirs(root, mode=0o700, exist_ok=True)
    directory = os.stat(root)
    if directory.st_uid != os.getuid() or directory.st_mode & 0o022:
        raise ValueError('Reservation directory is not privately owned')
    filename = os.path.join(root, hashlib.sha256(profile.encode()).hexdigest() + '.lock')
    flags = os.O_RDWR | os.O_NOFOLLOW
    created = False
    try:
        fd = os.open(filename, flags | os.O_CREAT | os.O_EXCL, 0o600)
        created = True
    except FileExistsError:
        fd = os.open(filename, flags)
    with os.fdopen(fd, 'r+', encoding='utf8') as handle:
        info = os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.getuid():
            raise ValueError('Reservation file has uncertain ownership or inode')
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            emit('busy', reason='Another cooperating launcher holds this profile reservation')
            return

        def persist(record):
            current = os.stat(filename, follow_symlinks=False)
            if (current.st_dev, current.st_ino) != (info.st_dev, info.st_ino):
                raise ValueError('Reservation inode changed; refusing to release ownership')
            handle.seek(0)
            handle.write(json.dumps(record))
            handle.truncate()
            handle.flush()
            os.fsync(handle.fileno())

        if created:
            persist({'version': 1, 'profile': profile, 'phase': 'idle'})
        handle.seek(0)
        try:
            previous = json.load(handle)
        except (ValueError, UnicodeError):
            emit('unavailable', reason='Missing or malformed reservation record; explicit recovery required')
            return
        if previous != {'version': 1, 'profile': profile, 'phase': 'idle'}:
            emit('unavailable', reason='Unclean or unknown prior reservation; explicit recovery required', previous=previous)
            return
        # Persist BEFORE telling Node it may inspect/launch. PID is diagnostic only.
        active = {'version': 1, 'profile': profile, 'phase': 'active', 'token': token,
                  'parentPid': int(parent_pid), 'holderPid': os.getpid()}
        persist(active)
        emit('acquired', holderPid=os.getpid(), lockFile=filename, profile=profile)
        for line in sys.stdin:
            try:
                request = json.loads(line)
            except ValueError:
                emit('unavailable', reason='Invalid holder message; unclean reservation retained')
                return
            if request not in ({'command': 'clean-close', 'token': token}, {'command': 'cancel-unlaunched', 'token': token}):
                emit('unavailable', reason='Unknown holder command; unclean reservation retained')
                return
            # Context-close proof is supplied by Node. Independently refuse leftovers.
            markers = [name for name in ('SingletonLock', 'SingletonSocket', 'SingletonCookie', 'RunningChromeVersion')
                       if os.path.lexists(os.path.join(profile, name))]
            if markers and request['command'] != 'cancel-unlaunched':
                emit('unavailable', reason='Chrome markers remain after close; unclean reservation retained', markers=markers)
                return
            persist({'version': 1, 'profile': profile, 'phase': 'idle'})
            fcntl.flock(handle, fcntl.LOCK_UN)
            emit('released')
            return
        # Parent pipe EOF, normal exit without close, SIGKILL: retain active intent.


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        emit('unavailable', reason=str(error))
        sys.exit(2)
