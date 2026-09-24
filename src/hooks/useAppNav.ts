/**
 * useAppNav — مدیریت navigation با history API
 *
 * هر بار که view عوض میشه، یه entry توی browser history push میشه.
 * وقتی کاربر Back میزنه، popstate fire میشه و view برمیگرده به قبلی.
 *
 * نقشه view → URL:
 *   home            → /
 *   login           → /login
 *   dashboard       → /dashboard
 *   quiz            → /quiz
 *   strokeChallenge → /stroke-challenge
 *   admin           → /admin
 *   learningHub     → /learning
 *   studentLesson   → /learning/lesson/:id
 *   school          → /school
 */

import { useCallback, useEffect, useRef } from 'react';
import type { ViewState } from '../App';

// view هایی که نباید توی history ذخیره بشن
const NO_HISTORY: ViewState[] = ['loading'];

// view هایی که بعد از back کاربر باید به اونا نره (مثلاً login بعد از logout)
const REPLACE_ONLY: ViewState[] = ['login'];

export function viewToPath(view: ViewState, lessonId?: string | null): string {
  switch (view) {
    case 'home':            return '/';
    case 'login':           return '/login';
    case 'dashboard':       return '/dashboard';
    case 'quiz':            return '/quiz';
    case 'strokeChallenge': return '/stroke-challenge';
    case 'admin':           return '/admin';
    case 'learningHub':     return '/learning';
    case 'studentLesson':   return lessonId ? `/learning/lesson/${lessonId}` : '/learning';
    case 'school':          return '/school';
    default:                return '/';
  }
}

export function pathToView(path: string): { view: ViewState; lessonId?: string } {
  if (path === '/' || path === '')          return { view: 'home' };
  if (path === '/login')                    return { view: 'login' };
  if (path === '/dashboard')                return { view: 'dashboard' };
  if (path === '/quiz')                     return { view: 'quiz' };
  if (path === '/stroke-challenge')         return { view: 'strokeChallenge' };
  if (path === '/admin')                    return { view: 'admin' };
  if (path === '/learning')                 return { view: 'learningHub' };
  if (path.startsWith('/learning/lesson/')) return { view: 'studentLesson', lessonId: path.split('/').pop() };
  if (path === '/school')                   return { view: 'school' };
  return { view: 'home' };
}

interface UseAppNavOptions {
  view: ViewState;
  activeLessonId: string | null;
  isLoggedIn: boolean;
  setView: (v: ViewState) => void;
  setActiveLessonId: (id: string | null) => void;
}

export function useAppNav({
  view,
  activeLessonId,
  isLoggedIn,
  setView,
  setActiveLessonId,
}: UseAppNavOptions) {
  // از push کردن duplicate جلوگیری می‌کنیم
  const lastPushedPath = useRef<string | null>(null);

  // هر بار view عوض میشه → history رو آپدیت کن
  useEffect(() => {
    if (NO_HISTORY.includes(view)) return;

    const path = viewToPath(view, activeLessonId);
    const current = window.location.pathname;

    if (path === lastPushedPath.current) return; // duplicate — رد کن
    lastPushedPath.current = path;

    const state = { view, lessonId: activeLessonId };

    if (REPLACE_ONLY.includes(view) || current === path) {
      // login و موارد مشابه رو replace کن تا توی history نمونه
      window.history.replaceState(state, '', path);
    } else {
      window.history.pushState(state, '', path);
    }
  }, [view, activeLessonId]);

  // وقتی کاربر Back/Forward میزنه
  useEffect(() => {
    const handlePop = (e: PopStateEvent) => {
      const state = e.state as { view?: ViewState; lessonId?: string } | null;

      if (state?.view) {
        // اگه لاگین نیست و میخواد بره جای protected → بره login
        const protectedViews: ViewState[] = ['dashboard', 'quiz', 'strokeChallenge', 'admin', 'learningHub', 'studentLesson', 'school'];
        if (!isLoggedIn && protectedViews.includes(state.view)) {
          setView('login');
          return;
        }
        if (state.view === 'studentLesson' && state.lessonId) {
          setActiveLessonId(state.lessonId);
        }
        setView(state.view);
        lastPushedPath.current = window.location.pathname;
      } else {
        // state نداره → از URL بخون
        const { view: v, lessonId } = pathToView(window.location.pathname);
        if (lessonId) setActiveLessonId(lessonId);
        setView(v);
        lastPushedPath.current = window.location.pathname;
      }
    };

    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [isLoggedIn, setView, setActiveLessonId]);

  // اولین بار که app لود میشه، اگه URL مستقیم باز شد handle کن
  const initFromUrl = useCallback(() => {
    const { view: urlView, lessonId } = pathToView(window.location.pathname);

    // اگه از قبل state داره (یعنی reload نیست) — کاری نکن
    if (window.history.state?.view) return;

    // state اولیه رو set کن
    window.history.replaceState(
      { view: urlView, lessonId: lessonId ?? null },
      '',
      window.location.pathname
    );
  }, []);

  return { initFromUrl };
}
