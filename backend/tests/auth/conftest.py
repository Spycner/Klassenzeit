"""Shared fixtures for auth tests.

The ``create_test_user`` and ``login_as`` fixtures are defined in the root
``backend/tests/conftest.py`` so that all test packages can use them without
duplication.  This file is intentionally empty of fixture definitions; it
exists as a marker that allows pytest to discover the auth package.
"""
