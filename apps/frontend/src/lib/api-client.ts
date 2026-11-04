export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

export async function getCurrentUser() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
      method: 'GET',
      credentials: 'include',
    });
    if (res.ok) {
      const data = await res.json();
      return data.user;
    }
    return null;
  } catch (error) {
    return null;
  }
}

export async function logoutUser() {
  try {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    localStorage.removeItem('user');
  }
}
