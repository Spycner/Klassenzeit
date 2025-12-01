import { useParams } from "react-router";

export function TeacherDetailPage() {
  const { id } = useParams();

  return (
    <div>
      <h1 className="text-2xl font-bold">
        {id ? "Edit Teacher" : "New Teacher"}
      </h1>
      <p className="mt-2 text-muted-foreground">
        {id ? `Editing teacher with ID: ${id}` : "Create a new teacher record."}
      </p>
    </div>
  );
}
