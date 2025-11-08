export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          user_id: string;
          display_name: string | null;
          avatar_url: string | null;
          default_budget: string | null;
          preferences: Json | null;
          travel_style: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          default_budget?: string | null;
          preferences?: Json | null;
          travel_style?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          default_budget?: string | null;
          preferences?: Json | null;
          travel_style?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_profiles_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      trips: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          destination: string;
          start_date: string;
          end_date: string;
          budget: string | null;
          travelers: Json | null;
          tags: string[] | null;
          llm_request: Json | null;
          budget_breakdown: Json | null;
          status: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          destination: string;
          start_date: string;
          end_date: string;
          budget?: string | null;
          travelers?: Json | null;
          tags?: string[] | null;
          llm_request?: Json | null;
          budget_breakdown?: Json | null;
          status?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          destination?: string;
          start_date?: string;
          end_date?: string;
          budget?: string | null;
          travelers?: Json | null;
          tags?: string[] | null;
          llm_request?: Json | null;
          budget_breakdown?: Json | null;
          status?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trips_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_days: {
        Row: {
          id: string;
          trip_id: string;
          date: string;
          summary: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          trip_id: string;
          date: string;
          summary?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          trip_id?: string;
          date?: string;
          summary?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_days_trip_id_fkey";
            columns: ["trip_id"];
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      activities: {
        Row: {
          id: string;
          trip_day_id: string;
          type: string;
          start_time: string | null;
          end_time: string | null;
          location: string | null;
          poi_id: string | null;
          cost: string | null;
          currency: string | null;
          details: Json | null;
          status: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          trip_day_id: string;
          type: string;
          start_time?: string | null;
          end_time?: string | null;
          location?: string | null;
          poi_id?: string | null;
          cost?: string | null;
          currency?: string | null;
          details?: Json | null;
          status?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          trip_day_id?: string;
          type?: string;
          start_time?: string | null;
          end_time?: string | null;
          location?: string | null;
          poi_id?: string | null;
          cost?: string | null;
          currency?: string | null;
          details?: Json | null;
          status?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activities_trip_day_id_fkey";
            columns: ["trip_day_id"];
            referencedRelation: "trip_days";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: {
          id: string;
          trip_id: string;
          category: string;
          amount: string;
          currency: string | null;
          source: string | null;
          memo: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          trip_id: string;
          category: string;
          amount: string;
          currency?: string | null;
          source?: string | null;
          memo?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          trip_id?: string;
          category?: string;
          amount?: string;
          currency?: string | null;
          source?: string | null;
          memo?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_trip_id_fkey";
            columns: ["trip_id"];
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_intents: {
        Row: {
          id: string;
          user_id: string;
          voice_input_id: string | null;
          raw_input: string;
          structured_payload: Json;
          field_confidences: Json | null;
          confidence: string;
          source: string;
          status: string;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          voice_input_id?: string | null;
          raw_input: string;
          structured_payload: Json;
          field_confidences?: Json | null;
          confidence?: string | null;
          source?: string;
          status?: string;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          voice_input_id?: string | null;
          raw_input?: string;
          structured_payload?: Json;
          field_confidences?: Json | null;
          confidence?: string | null;
          source?: string;
          status?: string;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_intents_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trip_intents_voice_input_id_fkey";
            columns: ["voice_input_id"];
            referencedRelation: "voice_inputs";
            referencedColumns: ["id"];
          },
        ];
      };
      voice_inputs: {
        Row: {
          id: string;
          trip_id: string | null;
          user_id: string;
          transcript: string | null;
          audio_url: string | null;
          status: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          trip_id?: string | null;
          user_id: string;
          transcript?: string | null;
          audio_url?: string | null;
          status?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          trip_id?: string | null;
          user_id?: string;
          transcript?: string | null;
          audio_url?: string | null;
          status?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "voice_inputs_trip_id_fkey";
            columns: ["trip_id"];
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "voice_inputs_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      sync_logs: {
        Row: {
          id: string;
          trip_id: string;
          change: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          trip_id: string;
          change: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          trip_id?: string;
          change?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sync_logs_trip_id_fkey";
            columns: ["trip_id"];
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      trip_expense_summary: {
        Row: {
          trip_id: string | null;
          total_expense: string | null;
          budget: string | null;
          budget_usage: string | null;
        };
        Relationships: [];
      };
    };
    Enums: Record<string, never>;
    Functions: {
      handle_new_user: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      set_updated_at: {
        Args: Record<string, never>;
        Returns: unknown;
      };
    };
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type Inserts<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type Updates<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
