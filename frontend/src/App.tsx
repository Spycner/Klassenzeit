import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Toaster } from "sonner";

import { queryClient } from "@/api";
import { AuthProvider, ProtectedRoute } from "@/auth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LanguageWrapper } from "@/components/LanguageWrapper";
import { AppLayout } from "@/components/layout";
import { SchoolProvider } from "@/contexts/SchoolContext";
import { defaultLanguage } from "@/i18n";
import { CallbackPage } from "@/pages/CallbackPage";
import { ClassesPage } from "@/pages/ClassesPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { Home } from "@/pages/Home";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { RoomsPage } from "@/pages/RoomsPage";
import { SchoolDetailPage } from "@/pages/SchoolDetailPage";
import { SchoolsListPage } from "@/pages/SchoolsListPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SubjectDetailPage } from "@/pages/SubjectDetailPage";
import { SubjectsListPage } from "@/pages/SubjectsListPage";
import { TeacherDetailPage } from "@/pages/TeacherDetailPage";
import { TeachersListPage } from "@/pages/TeachersListPage";
import { TimeSlotsPage } from "@/pages/TimeSlotsPage";
import { TimetablePage } from "@/pages/TimetablePage";

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <SchoolProvider>
            <BrowserRouter>
              <Routes>
                {/* OIDC callback route - must be at root level */}
                <Route path="/callback" element={<CallbackPage />} />

                <Route
                  path="/"
                  element={<Navigate to={`/${defaultLanguage}`} replace />}
                />

                <Route path="/:lang" element={<LanguageWrapper />}>
                  <Route index element={<Home />} />

                  {/* Protected routes - require authentication */}
                  <Route
                    element={
                      <ProtectedRoute>
                        <AppLayout />
                      </ProtectedRoute>
                    }
                  >
                    <Route path="dashboard" element={<DashboardPage />} />
                    <Route path="teachers" element={<TeachersListPage />} />
                    <Route
                      path="teachers/new"
                      element={<TeacherDetailPage />}
                    />
                    <Route
                      path="teachers/:id"
                      element={<TeacherDetailPage />}
                    />
                    <Route path="subjects" element={<SubjectsListPage />} />
                    <Route
                      path="subjects/new"
                      element={<SubjectDetailPage />}
                    />
                    <Route
                      path="subjects/:id"
                      element={<SubjectDetailPage />}
                    />
                    <Route path="rooms" element={<RoomsPage />} />
                    <Route path="classes" element={<ClassesPage />} />
                    <Route path="timeslots" element={<TimeSlotsPage />} />
                    <Route path="timetable" element={<TimetablePage />} />
                    <Route path="schools" element={<SchoolsListPage />} />
                    <Route path="schools/new" element={<SchoolDetailPage />} />
                    <Route
                      path="schools/:slug"
                      element={<SchoolDetailPage />}
                    />
                    <Route path="settings" element={<SettingsPage />} />
                  </Route>
                </Route>

                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </BrowserRouter>
            <Toaster position="top-right" richColors closeButton />
          </SchoolProvider>
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
