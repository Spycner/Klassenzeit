import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router";
import { Toaster } from "sonner";

import { queryClient } from "@/api";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppLayout } from "@/components/layout";
import { ClassesPage } from "@/pages/ClassesPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { Home } from "@/pages/Home";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { RoomsPage } from "@/pages/RoomsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { SubjectsPage } from "@/pages/SubjectsPage";
import { TeacherDetailPage } from "@/pages/TeacherDetailPage";
import { TeachersListPage } from "@/pages/TeachersListPage";
import { TimeSlotsPage } from "@/pages/TimeSlotsPage";
import { TimetablePage } from "@/pages/TimetablePage";

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />

            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/teachers" element={<TeachersListPage />} />
              <Route path="/teachers/new" element={<TeacherDetailPage />} />
              <Route path="/teachers/:id" element={<TeacherDetailPage />} />
              <Route path="/subjects" element={<SubjectsPage />} />
              <Route path="/rooms" element={<RoomsPage />} />
              <Route path="/classes" element={<ClassesPage />} />
              <Route path="/timeslots" element={<TimeSlotsPage />} />
              <Route path="/timetable" element={<TimetablePage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors closeButton />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
