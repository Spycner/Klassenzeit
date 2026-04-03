export interface SchoolResponse {
  id: string;
  name: string;
  slug: string;
  role: string;
  created_at: string;
}

export interface MemberResponse {
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  is_active: boolean;
  joined_at: string;
}
