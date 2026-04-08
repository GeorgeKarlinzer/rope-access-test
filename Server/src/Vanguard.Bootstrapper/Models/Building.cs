namespace Vanguard.Bootstrapper.Models
{
    public class Building
    {
        public Guid Id { get; set; }
        public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
        public DateTimeOffset? CompletedAt { get; set; }
        public string Name { get; set; } = string.Empty;
        public string? Location { get; set; }
        public BuildingStatus Status { get; set; } = BuildingStatus.Active;
        public string MainPhotoDataUrl { get; set; } = string.Empty;
        public List<Tag> Tags { get; set; } = [];
    }
}

