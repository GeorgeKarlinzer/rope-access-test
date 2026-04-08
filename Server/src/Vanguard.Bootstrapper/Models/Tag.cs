using System.Text.Json.Serialization;

namespace Vanguard.Bootstrapper.Models
{
    public class Tag
    {
        public Guid Id { get; set; }
        public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
        public int Seq { get; set; }
        public TagType Type { get; set; }
        public string? Name { get; set; }
        public double X { get; set; }
        public double Y { get; set; }
        public TagStatus Status { get; set; } = TagStatus.None;
        public List<TagPhoto> Photos { get; set; } = [];
        public List<TagComment> Comments { get; set; } = [];

        public Guid BuildingId { get; set; }

        [JsonIgnore]
        public Building? Building { get; set; }
    }
}

