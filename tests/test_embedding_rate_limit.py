from src.services.retrieval import _is_rate_limit


def test_wrapped_gemini_rate_limit():
    cause = Exception("quota")
    cause.code = 429
    wrapper = RuntimeError("embedding failed")
    wrapper.__cause__ = cause
    assert _is_rate_limit(wrapper)


def test_openai_status_code():
    error = Exception("rate limited")
    error.status_code = 429
    assert _is_rate_limit(error)


def test_non_retryable_error():
    cause = Exception("invalid key")
    cause.code = 403
    wrapper = RuntimeError("embedding failed")
    wrapper.__cause__ = cause
    assert not _is_rate_limit(wrapper)


def test_exception_cycle():
    error = RuntimeError("unknown")
    error.__cause__ = error
    assert not _is_rate_limit(error)


def test_implicit_context():
    cause = Exception("quota")
    cause.code = 429
    wrapper = RuntimeError("embedding failed")
    wrapper.__context__ = cause
    assert _is_rate_limit(wrapper)
